package cn.aihot.security;

import cn.aihot.config.AppProperties;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** 按照已有访问令牌规则保护接口和实时连接。 */
@Component
public class AccessFilter extends OncePerRequestFilter {
    private final AppProperties config;
    public AccessFilter(AppProperties config) { this.config = config; }
    @Override protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        String path = req.getServletPath();
        if (path == null || path.isEmpty()) path = req.getRequestURI();
        String origin = req.getHeader("Origin");
        if (origin != null && !java.util.Set.of("GET", "HEAD", "OPTIONS").contains(req.getMethod())) {
            try {
                if (!java.util.Objects.equals(java.net.URI.create(origin).getRawAuthority(), req.getHeader("Host"))) {
                    res.setStatus(403); res.setContentType("application/json;charset=UTF-8");
                    res.getWriter().write("{\"error\":\"不允许跨站修改数据\"}"); return;
                }
            } catch (IllegalArgumentException e) { res.sendError(403); return; }
        }
        if (config.apiToken() != null && !config.apiToken().isBlank() && (path.startsWith("/api/") || path.equals("/ws")) && !path.equals("/api/health")) {
            String supplied = req.getHeader("X-AIHot-Token");
            if (supplied == null && path.equals("/ws")) supplied = req.getParameter("token");
            if (supplied == null || !MessageDigest.isEqual(supplied.getBytes(StandardCharsets.UTF_8), config.apiToken().getBytes(StandardCharsets.UTF_8))) {
                res.setStatus(401); res.setContentType("application/json;charset=UTF-8"); res.getWriter().write("{\"error\":\"请输入正确的访问令牌\"}"); return;
            }
        }
        chain.doFilter(req, res);
    }
}
