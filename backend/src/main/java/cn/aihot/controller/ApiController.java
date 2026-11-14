package cn.aihot.controller;

import cn.aihot.config.AppProperties;
import cn.aihot.model.CustomAiSettings;
import cn.aihot.model.Models;
import cn.aihot.repository.HotspotRepository;
import cn.aihot.security.AiEndpointPolicy;
import cn.aihot.service.SearchService;
import cn.aihot.service.SourceService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.*;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import java.util.*;

/** 接收前端接口请求、校验参数并调用业务或数据访问层。 */
@RestController
@RequestMapping("/api")
@Validated
public class ApiController {
    private final HotspotRepository repo;
    private final SearchService search;
    private final AppProperties config;
    public ApiController(HotspotRepository repo, SearchService search, AppProperties config) { this.repo = repo; this.search = search; this.config = config; }
    public record SearchBody(@NotBlank @Size(max=160) String query, @Size(max=8) List<String> sources, Boolean useAi, @Valid CustomAiSettings customAi) {}
    public record KeywordBody(@NotBlank @Size(max=160) String term, Boolean enabled, @Min(5) @Max(1440) Integer intervalMinutes) {}
    public record KeywordPatch(Boolean enabled, @Min(5) @Max(1440) Integer intervalMinutes) {}
    public record BookmarkBody(boolean bookmarked) {}
    @GetMapping("/health") public Map<String, Object> health() { return Map.of("status", "ok", "application", "aihot-java", "time", Models.now()); }
    @GetMapping("/config") public Map<String, Object> config() {
        return Map.of("provider", config.provider(), "model", config.model(), "aiConfigured", config.aiConfigured(),
            "mailConfigured", config.mailConfigured(), "schedulerEnabled", config.schedulerEnabled(),
            "maxAnalysisPerRun", config.maxAnalysisPerRun(), "sources", SourceService.SOURCES,
            "running", search.running(), "database", repo.databaseProduct());
    }
    /** 校验检索来源后，将请求交给检索服务执行。 */
    @PostMapping("/search") public Models.SearchResult search(@Valid @RequestBody SearchBody body) {
        List<String> selected = body.sources() == null ? List.of("bing", "hackernews", "github", "bilibili") : body.sources().stream().distinct().toList();
        if (selected.isEmpty() || !SourceService.SOURCES.keySet().containsAll(selected)) throw new IllegalArgumentException("请选择有效的信息源");
        return search.search(body.query().trim(), selected, !Boolean.FALSE.equals(body.useAi()), body.customAi());
    }
    @GetMapping("/hotspots") public Map<String, Object> hotspots(@RequestParam(required=false) String q, @RequestParam(required=false) String source,
        @RequestParam(required=false) String importance, @RequestParam(required=false) String keywordId,
        @RequestParam(defaultValue="false") boolean bookmarked, @RequestParam(defaultValue="all") String timeRange,
        @RequestParam(defaultValue="latest") String sort, @RequestParam(defaultValue="1") @Min(1) @Max(100000) int page,
        @RequestParam(defaultValue="12") @Min(1) @Max(50) int size) {
        return repo.page(q, source, importance, keywordId, bookmarked, timeRange, sort, page, size);
    }
    @GetMapping("/hotspots/{id}") public Models.Hotspot hotspot(@PathVariable String id) { return repo.get(id); }
    @PatchMapping("/hotspots/{id}/bookmark") public Map<String, Boolean> bookmark(@PathVariable String id, @RequestBody BookmarkBody body) {
        if (!repo.bookmark(id, body.bookmarked())) throw new NoSuchElementException("热点不存在");
        return Map.of("bookmarked", body.bookmarked());
    }
    @GetMapping("/stats") public Map<String, Object> stats() { return repo.stats(); }
    @GetMapping("/keywords") public List<Models.Keyword> keywords() { return repo.keywords(); }
    @PostMapping("/keywords") public Models.Keyword keyword(@Valid @RequestBody KeywordBody body) {
        if (repo.keywords().size() >= 30 && repo.keywords().stream().noneMatch(k -> k.term().equals(body.term().trim()))) throw new IllegalArgumentException("最多添加 30 个监控词");
        return repo.saveKeyword(body.term().trim(), !Boolean.FALSE.equals(body.enabled()), body.intervalMinutes() == null ? 30 : body.intervalMinutes());
    }
    @PatchMapping("/keywords/{id}") public Models.Keyword patch(@PathVariable String id, @Valid @RequestBody KeywordPatch body) { return repo.patchKeyword(id, body.enabled(), body.intervalMinutes()); }
    @DeleteMapping("/keywords/{id}") public void delete(@PathVariable String id) { if (!repo.deleteKeyword(id)) throw new NoSuchElementException("监控词不存在"); }
    @PostMapping("/keywords/{id}/scan") public Models.SearchResult scan(@PathVariable String id) { return search.scanKeyword(id); }
    @GetMapping("/notifications") public Map<String, Object> notifications(@RequestParam(defaultValue="1") @Min(1) @Max(100000) int page, @RequestParam(defaultValue="20") @Min(1) @Max(50) int size) { return repo.notifications(page, size); }
    @PatchMapping("/notifications/{id}/read") public void read(@PathVariable String id) { repo.markRead(id); }
    @GetMapping("/sources") public Object sources() { return repo.health(); }
    @GetMapping("/runs") public Object runs() { return repo.runs(); }
    @RestControllerAdvice
    public static class Errors {
        @ExceptionHandler(AiEndpointPolicy.InvalidAiSettings.class) public ResponseEntity<?> invalidAi(AiEndpointPolicy.InvalidAiSettings e) { return ResponseEntity.badRequest().body(Map.of("error", e.getMessage())); }
        @ExceptionHandler(SearchService.BusyException.class) public ResponseEntity<?> busy() { return ResponseEntity.status(409).body(Map.of("error", "已有检索或监控任务正在执行，请稍后重试")); }
        @ExceptionHandler(NoSuchElementException.class) public ResponseEntity<?> missing(NoSuchElementException e) { return ResponseEntity.status(404).body(Map.of("error", e.getMessage())); }
        @ExceptionHandler({IllegalArgumentException.class, MethodArgumentNotValidException.class, jakarta.validation.ConstraintViolationException.class,
            org.springframework.web.method.annotation.HandlerMethodValidationException.class, org.springframework.http.converter.HttpMessageNotReadableException.class, org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class})
        public ResponseEntity<?> invalid(Exception e) { return ResponseEntity.badRequest().body(Map.of("error", "参数不正确：关键词为 1–160 字，监控间隔为 5–1440 分钟，请检查输入")); }
        @ExceptionHandler(Exception.class) public ResponseEntity<?> failure(Exception e) {
            org.slf4j.LoggerFactory.getLogger(Errors.class).error("Request failed: {}", e.getClass().getSimpleName());
            return ResponseEntity.internalServerError().body(Map.of("error", "服务暂时无法完成请求，请检查服务日志或稍后重试"));
        }
    }
}
