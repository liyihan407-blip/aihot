package cn.aihot.util;

import cn.aihot.model.Models;

import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;

/** 提供 URL、文本、时间和热度等通用处理方法。 */
public final class TextTools {
    private TextTools() {}
    public static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
    public static String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
    public static String truncate(String text, int max) { return text == null ? "" : text.substring(0, Math.min(max, text.length())); }
    public static String canonicalUrl(String value) {
        try {
            URI u = URI.create(value.trim());
            if (!Set.of("http", "https").contains(Objects.toString(u.getScheme(), "").toLowerCase(Locale.ROOT)) || u.getHost() == null || u.getRawUserInfo() != null) return "";
            String path = Optional.ofNullable(u.getRawPath()).orElse("").replaceAll("/+$", "");
            List<String> query = new ArrayList<>();
            if (u.getRawQuery() != null) for (String p : u.getRawQuery().split("&")) {
                String name = p.split("=", 2)[0].toLowerCase(Locale.ROOT);
                if (!name.startsWith("utm_") && !Set.of("fbclid", "gclid", "spm").contains(name)) query.add(p);
            }
            Collections.sort(query);
            return u.getScheme().toLowerCase(Locale.ROOT) + "://" + u.getHost().toLowerCase(Locale.ROOT).replaceFirst("^www\\.", "")
                + (u.getPort() == -1 ? "" : ":" + u.getPort()) + path + (query.isEmpty() ? "" : "?" + String.join("&", query));
        } catch (Exception e) { return ""; }
    }
    public static String instant(String value) {
        if (value == null || value.isBlank()) return null;
        try { return Instant.parse(value).toString(); } catch (Exception ignored) {}
        try { return ZonedDateTime.parse(value, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toString(); } catch (Exception ignored) {}
        return null;
    }
    public static List<String> basicTerms(String query) {
        LinkedHashSet<String> terms = new LinkedHashSet<>(); terms.add(query);
        String[] parts = query.split("[\\s/_-]+");
        if (parts.length > 1) for (String part : parts) if (part.length() >= 3 && !part.matches("[\\d.]+")) terms.add(part);
        return List.copyOf(terms);
    }
    public static double heat(Models.Article a) {
        return Math.round((Math.log10(1 + Math.max(0, a.likes())) * 22
            + Math.log10(1 + Math.max(0, a.comments())) * 12
            + Math.log10(1 + Math.max(0, a.views())) * 5) * 10) / 10.0;
    }
}
