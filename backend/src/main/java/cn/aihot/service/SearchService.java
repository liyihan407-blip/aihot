package cn.aihot.service;

import cn.aihot.config.AppProperties;
import cn.aihot.config.RealtimeConfig;
import cn.aihot.model.CustomAiSettings;
import cn.aihot.model.Models;
import cn.aihot.repository.HotspotRepository;
import cn.aihot.util.TextTools;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import jakarta.annotation.PreDestroy;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import static cn.aihot.model.Models.*;
import static cn.aihot.util.TextTools.*;

/** 组织采集、分析、筛选、入库和通知的完整检索流程。 */
@Service
public class SearchService {
    private final SourceService sources;
    private final AiService ai;
    private final HotspotRepository repo;
    private final AppProperties config;
    private final RealtimeConfig.Events events;
    private final MailService mail;
    private final AtomicBoolean running = new AtomicBoolean();
    private final ExecutorService mailWorker = new ThreadPoolExecutor(1, 1, 0L, TimeUnit.SECONDS, new ArrayBlockingQueue<>(32),
        Thread.ofPlatform().name("mail-worker").factory(), new ThreadPoolExecutor.DiscardPolicy());
    public SearchService(SourceService sources, AiService ai, HotspotRepository repo, AppProperties config, RealtimeConfig.Events events, MailService mail) {
        this.sources = sources;
        this.ai = ai;
        this.repo = repo;
        this.config = config;
        this.events = events;
        this.mail = mail;
    }

    public boolean running() { return running.get(); }

    /** 执行一次手动检索；同一时刻只允许一个检索任务运行。 */
    public SearchResult search(String query, List<String> selected, boolean useAi) {
        return search(query, selected, useAi, null);
    }

    public SearchResult search(String query, List<String> selected, boolean useAi, CustomAiSettings settings) {
        AiService.Session session = useAi && settings != null ? ai.createSession(settings) : null;
        if (!running.compareAndSet(false, true)) {
            throw new BusyException();
        }
        try {
            return execute(query, selected, useAi, null, session);
        } finally {
            running.set(false);
        }
    }

    /** 按监控词执行扫描，并在结束后安排下一次执行时间。 */
    public SearchResult scanKeyword(String id) {
        Keyword keyword = repo.keywords().stream()
            .filter(k -> k.id().equals(id))
            .findFirst()
            .orElseThrow(() -> new NoSuchElementException("监控词不存在"));
        if (!running.compareAndSet(false, true)) {
            throw new BusyException();
        }
        try {
            return execute(keyword.term(), List.of("bing", "hackernews", "github", "bilibili"), true, id, null);
        } finally {
            try {
                repo.scheduleNext(keyword);
            } finally {
                running.set(false);
            }
        }
    }
    /** 采集与去重后，优先使用缓存，并按预算分析、保存和通知。 */
    private SearchResult execute(String query, List<String> selected, boolean useAi, String keywordId, AiService.Session session) {
        String run = repo.startRun(query);
        int analyzed = 0;
        int cached = 0;
        int filtered = 0;
        int saved = 0;
        try {
            events.publish("progress", Map.of("stage", "collecting", "query", query, "message", "正在聚合信息源"));
            List<String> expanded = session == null ? ai.expand(query, useAi) : ai.expand(query, useAi, session);
            List<SourceResult> collected = sources.collect(query, expanded, selected);
            collected.forEach(repo::sourceHealth);
            var unique = new LinkedHashMap<String, Article>();
            // 轮询每个来源取一条，避免第一个来源占满分析预算。
            for (int i = 0; i < 12; i++) {
                for (SourceResult source : collected) {
                    if (i < source.items().size()) {
                        Article item = source.items().get(i);
                        unique.putIfAbsent(canonicalUrl(item.url()), item);
                    }
                }
            }
            List<Hotspot> output = new ArrayList<>(); boolean degraded = false;
            int budget = Math.clamp(config.maxAnalysisPerRun(), 1, 40), deferred = 0;
            for (Article item : unique.values()) {
                String key = hash(query.toLowerCase(Locale.ROOT) + "|" + canonicalUrl(item.url()) + "|" + item.title() + "|" + item.content()
                    + "|" + (session != null ? "custom:" + session.cacheKey()
                        : useAi && config.aiConfigured() ? config.provider() + ":" + config.model() : "rules"));
                Analysis analysis = repo.cached(key);
                if (analysis != null) cached++;
                else {
                    if (analyzed >= budget) { deferred++; continue; }
                    analyzed++; // 在调用前计数，包括失败、被过滤的内容。
                    events.publish("progress", Map.of("stage", "analyzing", "query", query, "message", "正在分析第 " + analyzed + " 条内容"));
                    analysis = session == null ? ai.analyze(item, query, expanded, useAi)
                        : ai.analyze(item, query, expanded, useAi, session);
                    if (!analysis.mode().equals("degraded")) repo.cache(key, analysis);
                }
                degraded |= analysis.mode().equals("degraded");
                if (!accepted(analysis)) { filtered++; continue; }
                var hotspot = new Hotspot(hash(canonicalUrl(item.url())), item, analysis, query, now(), heat(item), false);
                boolean fresh = repo.save(hotspot, keywordId);
                if (fresh) saved++;
                if (fresh && keywordId != null && analysis.mode().equals("ai")) {
                    repo.notify(hotspot); events.publish("notification", hotspot);
                    mailWorker.execute(() -> { if (config.mailConfigured() && Set.of("high", "urgent").contains(hotspot.analysis().importance()) && !mail.send(hotspot))
                        events.publish("mail-error", Map.of("message", "邮件未发送成功，请检查 SMTP 配置；站内通知已保留。")); });
                }
                Hotspot stored = repo.get(hotspot.id());
                output.add(new Hotspot(hotspot.id(), item, analysis, query, stored.createdAt(), hotspot.heat(), stored.bookmarked()));
            }
            output.sort(Comparator.comparingInt((Hotspot h) -> h.analysis().relevance()).reversed().thenComparing(Comparator.comparingDouble(Hotspot::heat).reversed()));
            boolean allFailed = collected.stream().allMatch(s -> s.status().equals("error"));
            String status = allFailed ? "failed" : collected.stream().anyMatch(s -> Set.of("error", "partial").contains(s.status())) ? "partial" : "completed";
            repo.finishRun(run, status, unique.size(), analyzed, saved, "缓存 " + cached + "；过滤 " + filtered + "；预算外 " + deferred);
            String mode = degraded ? "degraded" : useAi && (session != null || config.aiConfigured()) ? "ai" : "rules";
            var result = new SearchResult(run, query, expanded, output, collected.stream().map(s -> new SourceResult(s.source(), s.status(), s.count(), s.durationMs(), s.message(), List.of())).toList(),
                unique.size(), analyzed, cached, filtered, deferred, mode, now());
            events.publish("completed", Map.of("runId", run, "query", query, "saved", saved)); return result;
        } catch (Exception e) {
            repo.finishRun(run, "failed", 0, analyzed, saved, "任务失败，可重试");
            events.publish("failed", Map.of("runId", run, "message", "本次检索未完成，请稍后重试")); throw e;
        }
    }
    public static boolean accepted(Analysis a) {
        return a.relevant() && !a.suspicious() && a.relevance() >= 50 && (a.keywordMentioned() || a.relevance() >= 65);
    }
    /** 定期检查到期监控词，实际执行间隔由配置控制。 */
    @Scheduled(fixedDelayString = "${aihot.poll-ms:60000}", initialDelayString = "${aihot.poll-ms:60000}")
    public void tick() {
        if (!config.schedulerEnabled() || !running.compareAndSet(false, true)) return;
        try {
            for (Keyword keyword : repo.keywords()) {
                if (repo.keywords().stream().noneMatch(k -> k.id().equals(keyword.id()) && k.enabled())) continue;
                if (!keyword.enabled() || keyword.nextRunAt() != null && Instant.parse(keyword.nextRunAt()).isAfter(Instant.now())) continue;
                try { execute(keyword.term(), List.of("bing", "hackernews", "github", "bilibili"), true, keyword.id(), null); }
                catch (Exception ignored) { }
                finally { repo.scheduleNext(keyword); }
            }
        } finally { running.set(false); }
    }
    @PreDestroy public void close() { mailWorker.shutdownNow(); }
    public static class BusyException extends RuntimeException {}
}
