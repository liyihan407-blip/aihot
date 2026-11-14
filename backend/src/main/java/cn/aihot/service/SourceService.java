package cn.aihot.service;

import cn.aihot.config.AppProperties;
import cn.aihot.model.Models;
import cn.aihot.util.TextTools;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Element;
import org.jsoup.parser.Parser;
import org.springframework.stereotype.Service;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static cn.aihot.model.Models.*;
import static cn.aihot.util.TextTools.*;

/** 从选定的信息源采集内容并记录来源状态。 */
@Service
public class SourceService {
    public static final Map<String, String> SOURCES;
    static {
        var sources = new LinkedHashMap<String, String>();
        sources.put("google", "Google News"); sources.put("bing", "Bing"); sources.put("duckduckgo", "DuckDuckGo");
        sources.put("hackernews", "Hacker News"); sources.put("github", "GitHub"); sources.put("weixin", "搜狗微信");
        sources.put("bilibili", "哔哩哔哩"); sources.put("weibo", "微博"); SOURCES = Collections.unmodifiableMap(sources);
    }
    private final AppProperties config;
    private final ObjectMapper json;
    private final HttpClient client;
    private final ExecutorService workers = Executors.newFixedThreadPool(8);
    private final Map<String, Long> lastRequests = new ConcurrentHashMap<>();
    public SourceService(AppProperties config, ObjectMapper json) {
        this.config = config; this.json = json;
        client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(6)).followRedirects(HttpClient.Redirect.NORMAL).build();
    }
    /** 并行采集所选来源，返回每个来源的结果及状态。 */
    public List<SourceResult> collect(String query, List<String> expanded, List<String> selected) {
        var futures = selected.stream().map(source -> CompletableFuture.supplyAsync(() -> {
            long start = System.currentTimeMillis(); List<Article> items = new ArrayList<>(); List<String> failures = new ArrayList<>();
            // 最多使用一个额外的检索别名，避免扩展词导致请求数失控。
            var searches = new LinkedHashSet<String>(); searches.add(query);
            expanded.stream().filter(t -> !t.equalsIgnoreCase(query) && t.length() >= 4).findFirst().ifPresent(searches::add);
            for (String term : searches) {
                try { throttle(source); items.addAll(searchOne(source, term)); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); failures.add("请求已中断"); break; }
                catch (Exception e) { failures.add(safeError(e)); }
            }
            var unique = new LinkedHashMap<String, Article>();
            for (Article a : items) {
                String url = canonicalUrl(a.url());
                if (url.isEmpty() || a.title().isBlank()) continue;
                if (a.publishedAt() != null && Instant.parse(a.publishedAt()).isBefore(Instant.now().minus(Duration.ofDays(Math.max(1, config.maxAgeDays()))))) continue;
                unique.putIfAbsent(url, a);
            }
            List<Article> result = unique.values().stream().limit(12).toList();
            return new SourceResult(source, failures.isEmpty() ? (result.isEmpty() ? "empty" : "ok") : (result.isEmpty() ? "error" : "partial"),
                result.size(), System.currentTimeMillis() - start, failures.isEmpty() ? "" : String.join("；", failures), result);
        }, workers)).toList();
        return futures.stream().map(CompletableFuture::join).toList();
    }
    private void throttle(String source) throws InterruptedException {
        // 当前仅有一个检索批次运行，各来源独立限速；不依赖浏览器请求间隔。
        long wait = 1000 - (System.currentTimeMillis() - lastRequests.getOrDefault(source, 0L));
        if (wait > 0) Thread.sleep(wait);
        lastRequests.put(source, System.currentTimeMillis());
    }
    String fetch(String url) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(Math.max(2, config.sourceTimeoutSeconds())))
            .header("User-Agent", "Mozilla/5.0 (compatible; AIHot/1.0)")
            .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8").GET().build();
        var response = client.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) throw new IllegalStateException("HTTP " + response.statusCode());
        if (response.body().length() > 6_000_000) throw new IllegalStateException("响应内容过大");
        return response.body();
    }
    private static String safeError(Exception e) {
        if (e instanceof HttpTimeoutException || e instanceof java.net.SocketTimeoutException) return "来源请求超时，可稍后重试";
        if (e instanceof java.io.IOException) return "网络连接失败，请检查网络后重试";
        String m = Objects.toString(e.getMessage(), "");
        return m.matches("HTTP \\d{3}") ? m + "，该来源暂不可用" : "来源解析失败或需要访问验证";
    }
    List<Article> searchOne(String source, String query) throws Exception {
        String q = encode(query);
        return switch (source) {
            case "google" -> parseRss(fetch("https://news.google.com/rss/search?q=" + q + "+when:7d&hl=zh-CN&gl=CN&ceid=CN:zh-Hans"), source);
            case "bing" -> parseRss(fetch("https://cn.bing.com/search?format=rss&q=" + q), source);
            case "hackernews" -> parseHackerNews(json.readTree(fetch("https://hn.algolia.com/api/v1/search_by_date?query=" + q + "&tags=story&hitsPerPage=12")));
            case "github" -> parseGitHub(json.readTree(fetch("https://api.github.com/search/repositories?q=" + q + "&sort=updated&per_page=10")));
            case "bilibili" -> parseBilibili(json.readTree(fetch("https://api.bilibili.com/x/web-interface/search/type?search_type=video&order=pubdate&keyword=" + q)));
            case "weibo" -> parseWeibo(fetch("https://s.weibo.com/weibo?q=" + q));
            case "duckduckgo" -> parseHtml(fetch("https://html.duckduckgo.com/html/?q=" + q), source, "https://duckduckgo.com");
            case "weixin" -> parseHtml(fetch("https://weixin.sogou.com/weixin?type=2&query=" + q), source, "https://weixin.sogou.com");
            default -> throw new IllegalArgumentException("不支持的信息源");
        };
    }
    public List<Article> parseRss(String xml, String source) {
        var doc = Jsoup.parse(xml, "", Parser.xmlParser()); var items = new ArrayList<Article>();
        if (doc.select("rss,feed").isEmpty()) throw new IllegalStateException("来源未返回订阅内容");
        for (Element item : doc.select("item,entry")) {
            String url = item.selectFirst("link") == null ? "" : item.selectFirst("link").hasAttr("href") ? item.selectFirst("link").attr("href") : item.selectFirst("link").text();
            String description = item.select("description,summary,content").text();
            items.add(new Article(source, item.select("title").text(), url, truncate(Jsoup.parse(description).text(), 3500),
                instant(item.select("pubDate,published,updated").text()), 0, 0, 0, ""));
        }
        return items;
    }
    List<Article> parseHackerNews(JsonNode data) {
        List<Article> result = new ArrayList<>();
        for (JsonNode hit : data.path("hits")) {
            String url = hit.path("url").asText(""); if (url.isBlank()) url = "https://news.ycombinator.com/item?id=" + hit.path("objectID").asText();
            result.add(new Article("hackernews", hit.path("title").asText(), url, Jsoup.parse(hit.path("story_text").asText("")).text(),
                instant(hit.path("created_at").asText()), hit.path("points").asLong(), 0, hit.path("num_comments").asLong(), hit.path("author").asText()));
        } return result;
    }
    List<Article> parseGitHub(JsonNode data) {
        List<Article> result = new ArrayList<>();
        if (data.has("message")) throw new IllegalStateException("GitHub 请求失败");
        for (JsonNode repo : data.path("items")) result.add(new Article("github", repo.path("full_name").asText(), repo.path("html_url").asText(),
            truncate(repo.path("description").asText(""), 3500), instant(repo.path("pushed_at").asText()), repo.path("stargazers_count").asLong(), 0,
            repo.path("forks_count").asLong(), repo.path("owner").path("login").asText()));
        return result;
    }
    List<Article> parseBilibili(JsonNode data) {
        if (data.path("code").asInt(-1) != 0) throw new IllegalStateException("B站来源需要验证");
        List<Article> result = new ArrayList<>();
        for (JsonNode v : data.path("data").path("result")) result.add(new Article("bilibili", Jsoup.parse(v.path("title").asText()).text(),
            v.path("arcurl").asText("https://www.bilibili.com/video/" + v.path("bvid").asText()), truncate(v.path("description").asText(), 3500),
            v.path("pubdate").asLong() > 0 ? Instant.ofEpochSecond(v.path("pubdate").asLong()).toString() : null,
            v.path("like").asLong(), metric(v.path("play").asText()), metric(v.path("danmaku").asText()), v.path("author").asText()));
        return result;
    }
    static long metric(String value) {
        try { return (long) (Double.parseDouble(value.replaceAll("[^0-9.]", "")) * (value.contains("万") ? 10000 : value.contains("亿") ? 100000000 : 1)); }
        catch (Exception e) { return 0; }
    }
    List<Article> parseHtml(String html, String source, String base) {
        var doc = Jsoup.parse(html, base); var result = new ArrayList<Article>();
        if (html.contains("验证码") || html.contains("captcha") || html.contains("antispider")) throw new IllegalStateException("来源访问验证");
        String selector = source.equals("duckduckgo") ? ".result" : ".news-list li";
        for (Element card : doc.select(selector)) {
            Element a = card.selectFirst(source.equals("duckduckgo") ? ".result__a" : "h3 a"); if (a == null) continue;
            String url = a.absUrl("href");
            if (source.equals("duckduckgo") && url.contains("uddg=")) {
                String raw = URI.create(url).getRawQuery();
                for (String part : raw.split("&")) if (part.startsWith("uddg=")) url = java.net.URLDecoder.decode(part.substring(5), java.nio.charset.StandardCharsets.UTF_8);
            }
            result.add(new Article(source, a.text(), url, truncate(card.select(source.equals("duckduckgo") ? ".result__snippet" : ".txt-info").text(), 3500), null, 0, 0, 0, card.select(".account").text()));
        } return result;
    }
    List<Article> parseWeibo(String html) {
        if (html.contains("Sina Visitor System") || html.contains("passport.weibo.com")) throw new IllegalStateException("微博来源需要访问验证");
        var doc = Jsoup.parse(html, "https://s.weibo.com"); List<Article> result = new ArrayList<>();
        for (Element card : doc.select(".card-wrap")) {
            Element content = card.selectFirst(".txt"); Element link = card.selectFirst(".from a"); if (content == null || link == null) continue;
            result.add(new Article("weibo", truncate(content.text(), 160), link.absUrl("href"), truncate(content.text(), 3500), null, 0, 0, 0, card.select(".name").text()));
        } return result;
    }
    @PreDestroy public void close() { workers.shutdownNow(); client.close(); }
}
