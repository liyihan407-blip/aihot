package cn.aihot.model;



import java.time.Instant;
import java.util.List;

/** 集中定义热点、分析结果、监控词等数据对象。 */
public final class Models {
    private Models() {}
    public record Article(String source, String title, String url, String content, String publishedAt,
                          long likes, long views, long comments, String author) {}
    public record Analysis(boolean relevant, boolean suspicious, int relevance, int confidence,
                           boolean keywordMentioned, String importance, String summary, String reason,
                           String mode, String provider) {}
    public record Hotspot(String id, Article article, Analysis analysis, String query,
                          String createdAt, double heat, boolean bookmarked) {}
    public record SourceResult(String source, String status, int count, long durationMs,
                               String message, List<Article> items) {}
    public record SearchResult(String runId, String query, List<String> expandedTerms, List<Hotspot> items,
                               List<SourceResult> sources, int collected, int analyzed, int cached,
                               int filtered, int deferred, String mode, String finishedAt) {}
    public record Keyword(String id, String term, boolean enabled, int intervalMinutes,
                          String nextRunAt, String lastRunAt, String createdAt) {}
    public static String now() { return Instant.now().toString(); }
}
