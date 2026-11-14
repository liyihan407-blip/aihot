package cn.aihot;

import cn.aihot.config.AppProperties;
import cn.aihot.service.AiService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.*;

/** 使用本地模拟服务检查百炼请求地址、模型和响应解析，不调用真实 API。 */
class BailianIntegrationTest {
    @Test
    void sendsCompatibleChatRequestAndParsesResponse() throws Exception {
        var path = new AtomicReference<String>();
        var authorization = new AtomicReference<String>();
        var requestBody = new AtomicReference<String>();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            path.set(exchange.getRequestURI().getPath());
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] body = """
                {"id":"test","object":"chat.completion","created":1,"model":"qwen-plus",
                 "choices":[{"index":0,"message":{"role":"assistant","content":"[\\\"AIHot\\\",\\\"热点检索\\\"]"},"finish_reason":"stop"}],
                 "usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}
                """.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            try (var output = exchange.getResponseBody()) { output.write(body); }
        });
        server.start();
        try {
            String baseUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/compatible-mode/v1";
            var properties = new AppProperties("bailian", "", "", "", "", false, 2, 7, 5, 2,
                false, "", "", 587, "", "", false, "", "local-test-key", "qwen-plus", baseUrl);
            var mapper = new ObjectMapper();
            var service = new AiService(properties, mapper);

            assertEquals(List.of("AIHot", "热点检索"), service.expand("AIHot", true));
            assertEquals("/compatible-mode/v1/chat/completions", path.get());
            assertEquals("Bearer local-test-key", authorization.get());
            assertEquals("qwen-plus", mapper.readTree(requestBody.get()).path("model").asText());
        } finally {
            server.stop(0);
        }
    }
}
