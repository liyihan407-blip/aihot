package cn.aihot.config;

import cn.aihot.model.Models;
import cn.aihot.repository.HotspotRepository;
import cn.aihot.util.TextTools;

import com.fasterxml.jackson.databind.*;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.nio.file.*;
import java.util.*;
import static cn.aihot.model.Models.*;
import static cn.aihot.util.TextTools.*;

/** 按原有规则导入旧版数据。 */
@Component
public class LegacyImporter implements ApplicationRunner {
    private final AppProperties config; private final HotspotRepository repo; private final ObjectMapper json;
    public LegacyImporter(AppProperties config, HotspotRepository repo, ObjectMapper json) { this.config = config; this.repo = repo; this.json = json; }
    @Override @Transactional public void run(ApplicationArguments args) throws Exception {
        repo.recoverRuns();
        Path file = Path.of("data/state.json");
        if (!config.legacyImport() || !Files.exists(file) || repo.setting("legacy-import-v1") != null) return;
        JsonNode data = json.readTree(Files.readString(file));
        Map<String, String> keywordIds = new HashMap<>();
        for (String collection : List.of("monitors", "scopes")) for (JsonNode node : data.path(collection)) {
            String term = node.path(collection.equals("monitors") ? "keyword" : "scope").asText("").trim();
            if (term.isEmpty()) continue;
            Keyword k = repo.saveKeyword(truncate(term, 160), node.path("enabled").asBoolean(true), Math.clamp(node.path("intervalMinutes").asInt(30), 5, 1440));
            keywordIds.put(term, k.id());
        }
        int imported = 0;
        for (JsonNode n : data.path("notifications")) {
            JsonNode item = n.path("item"), v = n.path("verdict"); String url = item.path("url").asText();
            if (canonicalUrl(url).isBlank()) continue;
            String term = n.path("keyword").asText("历史记录");
            var a = new Article(source(item.path("source").asText()), item.path("title").asText("历史内容"), url, item.path("summary").asText(""), instant(item.path("publishedAt").asText()), 0, 0, 0, "");
            var analysis = new Analysis(true, false, (int)(v.path("confidence").asDouble(.5) * 100), 0, true, "low",
                v.path("notificationBody").asText(a.content()), "从旧版导入，保留历史内容；未重新分析。", "legacy", "legacy");
            repo.save(new Hotspot(hash(canonicalUrl(url)), a, analysis, term, Objects.requireNonNullElse(instant(n.path("createdAt").asText()), now()), heat(a), false), keywordIds.get(term)); imported++;
        }
        for (JsonNode report : data.path("hotTopics")) for (JsonNode topic : report.path("topics")) for (JsonNode item : topic.path("sources")) {
            String url = item.path("url").asText(); if (canonicalUrl(url).isBlank()) continue;
            String term = report.path("scope").asText("历史报告");
            var a = new Article(source(item.path("source").asText()), item.path("title").asText(topic.path("title").asText()), url, item.path("summary").asText(""), instant(item.path("publishedAt").asText()), 0, 0, 0, "");
            var analysis = new Analysis(true, false, 0, 0, false, "low", topic.path("why").asText(""), "从旧版热点报告导入，未重新分析。", "legacy", "legacy");
            repo.save(new Hotspot(hash(canonicalUrl(url)), a, analysis, term, Objects.requireNonNullElse(instant(report.path("createdAt").asText()), now()), heat(a), false), keywordIds.get(term)); imported++;
        }
        repo.setting("legacy-import-v1", now() + "; records=" + imported);
        org.slf4j.LoggerFactory.getLogger(getClass()).info("Imported legacy JSON data; original file retained. Records: {}", imported);
    }
    private String source(String value) {
        return switch (value) { case "Google News" -> "google"; case "Bing" -> "bing"; case "DuckDuckGo" -> "duckduckgo";
            case "Hacker News" -> "hackernews"; case "GitHub" -> "github"; case "Sogou Weixin" -> "weixin"; case "Bilibili" -> "bilibili"; case "Weibo" -> "weibo"; default -> value; };
    }
}
