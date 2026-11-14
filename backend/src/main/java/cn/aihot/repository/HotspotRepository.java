package cn.aihot.repository;

import cn.aihot.model.Models;
import cn.aihot.util.TextTools;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.*;
import static cn.aihot.model.Models.*;

/** 负责热点、监控词、通知和运行记录的数据库读写。 */
@Repository
public class HotspotRepository {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    public HotspotRepository(JdbcTemplate db, ObjectMapper json) { this.db = db; this.json = json; }
    public String databaseProduct() { return db.execute((org.springframework.jdbc.core.ConnectionCallback<String>) c -> c.getMetaData().getDatabaseProductName()); }
    public String serialize(Object value) {
        try { return json.writeValueAsString(value); } catch (Exception e) { throw new IllegalStateException("数据序列化失败", e); }
    }
    public <T> T decode(String value, Class<T> type) {
        try { return json.readValue(value, type); } catch (Exception e) { throw new IllegalStateException("存储数据读取失败", e); }
    }
    private Keyword keyword(ResultSet r, int row) throws SQLException {
        return new Keyword(r.getString("id"), r.getString("term"), r.getBoolean("enabled"), r.getInt("interval_minutes"),
            r.getString("next_run_at"), r.getString("last_run_at"), r.getString("created_at"));
    }
    public List<Keyword> keywords() { return db.query("SELECT * FROM keywords ORDER BY created_at DESC", this::keyword); }
    /** 保存监控词和执行间隔，并返回保存后的记录。 */
    public Keyword saveKeyword(String term, boolean enabled, int minutes) {
        var old = db.query("SELECT * FROM keywords WHERE term=?", this::keyword, term);
        String id = old.isEmpty() ? UUID.randomUUID().toString() : old.getFirst().id();
        if (old.isEmpty()) db.update("INSERT INTO keywords VALUES(?,?,?,?,?,?,?)", id, term, enabled, minutes, enabled ? now() : null, null, now());
        else db.update("UPDATE keywords SET enabled=?,interval_minutes=?,next_run_at=? WHERE id=?", enabled, minutes, enabled ? now() : null, id);
        return keywords().stream().filter(k -> k.id().equals(id)).findFirst().orElseThrow();
    }
    public Keyword patchKeyword(String id, Boolean enabled, Integer minutes) {
        var old = keywords().stream().filter(k -> k.id().equals(id)).findFirst().orElseThrow(() -> new NoSuchElementException("监控词不存在"));
        return saveKeyword(old.term(), enabled == null ? old.enabled() : enabled, minutes == null ? old.intervalMinutes() : minutes);
    }
    public boolean deleteKeyword(String id) { return db.update("DELETE FROM keywords WHERE id=?", id) > 0; }
    public void scheduleNext(Keyword k) {
        db.update("UPDATE keywords SET last_run_at=?,next_run_at=? WHERE id=?", now(), Instant.now().plusSeconds(k.intervalMinutes() * 60L).toString(), k.id());
    }
    private Hotspot mapHotspot(ResultSet r, int row) throws SQLException {
        Hotspot h = decode(r.getString("payload"), Hotspot.class);
        return new Hotspot(h.id(), h.article(), h.analysis(), h.query(), h.createdAt(), h.heat(), r.getBoolean("bookmarked"));
    }
    @Transactional
    public boolean save(Hotspot h, String keywordId) {
        boolean fresh = false;
        try {
            db.update("INSERT INTO hotspots(id,url_key,source,title,published_at,created_at,relevance,importance,heat,bookmarked,payload) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                h.id(), h.id(), h.article().source(), TextTools.truncate(h.article().title(), 1000), h.article().publishedAt(), h.createdAt(),
                h.analysis().relevance(), h.analysis().importance(), h.heat(), false, serialize(h));
            fresh = true;
        } catch (DuplicateKeyException ignored) { }
        if (keywordId != null) {
            try { db.update("INSERT INTO keyword_hotspots(keyword_id,hotspot_id,relevance,importance,payload) VALUES(?,?,?,?,?)", keywordId, h.id(), h.analysis().relevance(), h.analysis().importance(), serialize(h)); fresh = true; }
            catch (DuplicateKeyException ignored) { fresh = false; }
        }
        return fresh;
    }
    public Map<String, Object> page(String query, String source, String importance, String keywordId, boolean bookmarked,
                                    String timeRange, String sort, int page, int size) {
        boolean scoped = keywordId != null && !keywordId.isBlank();
        String select = scoped ? "kh.payload" : "h.payload";
        String analysisTable = scoped ? "kh." : "h.";
        String from = " FROM hotspots h";
        List<Object> args = new ArrayList<>(); List<String> where = new ArrayList<>();
        if (keywordId != null && !keywordId.isBlank()) {
            from += " JOIN keyword_hotspots kh ON h.id=kh.hotspot_id"; where.add("kh.keyword_id=?"); args.add(keywordId);
        }
        if (query != null && !query.isBlank()) { where.add("LOWER(h.title) LIKE ? ESCAPE '!' "); args.add("%" + query.toLowerCase(Locale.ROOT).replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%"); }
        if (source != null && !source.isBlank()) { where.add("h.source=?"); args.add(source); }
        if (importance != null && !importance.isBlank()) { where.add(analysisTable + "importance=?"); args.add(importance); }
        if (bookmarked) where.add("h.bookmarked=TRUE");
        long hours = switch (Objects.toString(timeRange, "")) { case "1h" -> 1; case "24h" -> 24; case "7d" -> 168; case "30d" -> 720; default -> 0; };
        if (hours > 0) { where.add("h.created_at>=?"); args.add(Instant.now().minusSeconds(hours * 3600).toString()); }
        String clause = where.isEmpty() ? "" : " WHERE " + String.join(" AND ", where);
        String order = switch (Objects.toString(sort, "")) {
            case "heat" -> "h.heat DESC";
            case "relevance" -> analysisTable + "relevance DESC";
            case "published" -> "h.published_at DESC";
            case "importance" -> "CASE " + analysisTable + "importance WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC";
            default -> "h.created_at DESC";
        };
        long total = db.queryForObject("SELECT COUNT(*)" + from + clause, Long.class, args.toArray());
        args.add(size); args.add((page - 1) * size);
        var items = db.query("SELECT " + select + ",h.bookmarked" + from + clause + " ORDER BY " + order + ",h.id LIMIT ? OFFSET ?", this::mapHotspot, args.toArray());
        return Map.of("items", items, "total", total, "page", page, "size", size, "pages", (total + size - 1) / size);
    }
    public Hotspot get(String id) {
        return db.query("SELECT payload,bookmarked FROM hotspots WHERE id=?", this::mapHotspot, id).stream().findFirst().orElseThrow(() -> new NoSuchElementException("热点不存在"));
    }
    public boolean bookmark(String id, boolean value) { return db.update("UPDATE hotspots SET bookmarked=? WHERE id=?", value, id) > 0; }
    public Analysis cached(String key) {
        var values = db.queryForList("SELECT payload FROM judgments WHERE cache_key=? AND created_at>=?", String.class, key, Instant.now().minusSeconds(86400).toString());
        return values.isEmpty() ? null : decode(values.getFirst(), Analysis.class);
    }
    public void cache(String key, Analysis a) {
        db.update("DELETE FROM judgments WHERE cache_key=?", key);
        db.update("INSERT INTO judgments VALUES(?,?,?)", key, serialize(a), now());
    }
    public void sourceHealth(SourceResult s) {
        db.update("DELETE FROM source_health WHERE source=?", s.source());
        db.update("INSERT INTO source_health VALUES(?,?,?,?,?,?)", s.source(), s.status(), s.count(), s.durationMs(), TextTools.truncate(s.message(), 600), now());
    }
    public List<Map<String, Object>> health() { return db.queryForList("SELECT * FROM source_health ORDER BY source"); }
    public Map<String, Object> stats() {
        return Map.of("total", db.queryForObject("SELECT COUNT(*) FROM hotspots", Long.class),
            "today", db.queryForObject("SELECT COUNT(*) FROM hotspots WHERE created_at>=?", Long.class, Instant.now().minusSeconds(86400).toString()),
            "activeMonitors", db.queryForObject("SELECT COUNT(*) FROM keywords WHERE enabled=TRUE", Long.class),
            "unread", db.queryForObject("SELECT COUNT(*) FROM notifications WHERE is_read=FALSE", Long.class),
            "bookmarked", db.queryForObject("SELECT COUNT(*) FROM hotspots WHERE bookmarked=TRUE", Long.class),
            "bySource", db.queryForList("SELECT source,COUNT(*) AS total FROM hotspots GROUP BY source ORDER BY total DESC"));
    }
    public void notify(Hotspot h) {
        db.update("INSERT INTO notifications(id,hotspot_id,title,content,is_read,created_at) VALUES(?,?,?,?,?,?)",
            UUID.randomUUID().toString(), h.id(), TextTools.truncate(h.article().title(), 1000), h.analysis().summary(), false, now());
    }
    public Map<String, Object> notifications(int page, int size) {
        return Map.of("items", db.queryForList("SELECT * FROM notifications ORDER BY created_at DESC LIMIT ? OFFSET ?", size, (page - 1) * size),
            "total", db.queryForObject("SELECT COUNT(*) FROM notifications", Long.class),
            "unread", db.queryForObject("SELECT COUNT(*) FROM notifications WHERE is_read=FALSE", Long.class));
    }
    public void markRead(String id) {
        if ("all".equals(id)) db.update("UPDATE notifications SET is_read=TRUE");
        else db.update("UPDATE notifications SET is_read=TRUE WHERE id=?", id);
    }
    public String startRun(String query) {
        String id = UUID.randomUUID().toString();
        db.update("INSERT INTO job_runs(id,query_text,status,created_at) VALUES(?,?,?,?)", id, query, "running", now()); return id;
    }
    public void finishRun(String id, String status, int collected, int analyzed, int saved, String message) {
        db.update("UPDATE job_runs SET status=?,collected=?,analyzed=?,saved=?,message=?,finished_at=? WHERE id=?", status, collected, analyzed, saved, message, now(), id);
    }
    public List<Map<String, Object>> runs() { return db.queryForList("SELECT * FROM job_runs ORDER BY created_at DESC LIMIT 30"); }
    public void recoverRuns() { db.update("UPDATE job_runs SET status='interrupted',message='上次服务停止，任务已中断',finished_at=? WHERE status='running'", now()); }
    public String setting(String key) { return db.queryForList("SELECT setting_value FROM app_settings WHERE setting_key=?", String.class, key).stream().findFirst().orElse(null); }
    public void setting(String key, String value) {
        db.update("DELETE FROM app_settings WHERE setting_key=?", key); db.update("INSERT INTO app_settings VALUES(?,?)", key, value);
    }
}
