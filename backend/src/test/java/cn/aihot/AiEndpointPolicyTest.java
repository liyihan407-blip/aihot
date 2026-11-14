package cn.aihot;

import cn.aihot.security.AiEndpointPolicy;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/** 页面配置的地址必须经过限制，防止请求内网或伪装域名。 */
class AiEndpointPolicyTest {
    @Test void acceptsSupportedHttpsBaseUrl() {
        assertEquals("https://dashscope.aliyuncs.com/compatible-mode/v1",
            AiEndpointPolicy.validate("https://dashscope.aliyuncs.com/compatible-mode/v1/"));
        assertEquals("https://api.openai.com/v1", AiEndpointPolicy.validate("https://api.openai.com/v1"));
    }

    @Test void rejectsUnsafeOrUnsupportedAddresses() {
        for (String url : new String[] {
            "http://api.openai.com/v1", "https://127.0.0.1/v1", "https://localhost/v1",
            "https://api.openai.com.attacker.invalid/v1", "https://api.openai.com:8080/v1",
            "https://user:pass@api.openai.com/v1", "https://api.openai.com/v1?key=secret",
            "https://api.openai.com/v1/chat/completions"
        }) {
            assertThrows(AiEndpointPolicy.InvalidAiSettings.class, () -> AiEndpointPolicy.validate(url));
        }
    }
}
