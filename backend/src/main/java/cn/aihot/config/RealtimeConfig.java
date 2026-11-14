package cn.aihot.config;

import cn.aihot.model.Models;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.config.annotation.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/** 配置实时连接，并向前端推送任务事件。 */
@Configuration
@EnableWebSocket
public class RealtimeConfig implements WebSocketConfigurer {
    private final Events events;
    @Value("${ALLOWED_ORIGINS:http://localhost:*,http://127.0.0.1:*}") private String origins;
    public RealtimeConfig(Events events) { this.events = events; }
    @Override public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(events, "/ws").setAllowedOriginPatterns(origins.split(","));
    }
    @Component
    public static class Events extends TextWebSocketHandler {
        private final Set<WebSocketSession> sessions = ConcurrentHashMap.newKeySet();
        private final ObjectMapper json;
        public Events(ObjectMapper json) { this.json = json; }
        @Override public void afterConnectionEstablished(WebSocketSession session) { sessions.add(session); }
        @Override public void afterConnectionClosed(WebSocketSession session, CloseStatus status) { sessions.remove(session); }
        @Override public void handleTransportError(WebSocketSession session, Throwable e) throws Exception { sessions.remove(session); session.close(); }
        public void publish(String type, Object payload) {
            try {
                var message = new TextMessage(json.writeValueAsString(Map.of("type", type, "data", payload, "createdAt", Models.now())));
                for (var session : sessions) {
                    try { synchronized (session) { if (session.isOpen()) session.sendMessage(message); } }
                    catch (Exception e) { sessions.remove(session); }
                }
            } catch (Exception ignored) { }
        }
    }
}
