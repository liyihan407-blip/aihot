package cn.aihot.security;

import java.net.URI;
import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/** 限制用户填写的模型接口地址，避免服务器被用来访问内部服务。 */
public final class AiEndpointPolicy {
    private static final Set<String> DEFAULT_HOSTS = Set.of(
        "dashscope.aliyuncs.com", "dashscope-intl.aliyuncs.com", "api.siliconflow.cn",
        "openrouter.ai", "api.openai.com"
    );

    private AiEndpointPolicy() {}

    /** 返回以 /v1 结尾的标准 Base URL；其他可信主机可由管理员通过环境变量加入。 */
    public static String validate(String value) {
        return validate(value, "");
    }

    public static String validate(String value, String additionalHosts) {
        if (value == null) throw new InvalidAiSettings("请填写 AI 接口地址");
        try {
            URI uri = URI.create(value.trim());
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme()) || host == null || uri.getUserInfo() != null
                || uri.getRawQuery() != null || uri.getRawFragment() != null
                || (uri.getPort() != -1 && uri.getPort() != 443)) {
                throw new InvalidAiSettings("接口地址必须是 HTTPS 地址，且不能包含账号、查询参数或非标准端口");
            }
            host = host.toLowerCase(Locale.ROOT);
            String extra = additionalHosts == null ? "" : additionalHosts;
            Set<String> allowed = Arrays.stream(extra.split(",")).map(String::trim)
                .map(s -> s.toLowerCase(Locale.ROOT)).filter(s -> !s.isEmpty()).collect(Collectors.toSet());
            if (!DEFAULT_HOSTS.contains(host) && !allowed.contains(host)) {
                throw new InvalidAiSettings("接口域名尚未允许，请使用支持的平台，或由管理员在 AI_ALLOWED_HOSTS 中配置");
            }
            String normalized = value.trim().replaceAll("/+$", "");
            if (!uri.getPath().replaceAll("/+$", "").endsWith("/v1")) {
                throw new InvalidAiSettings("请填写以 /v1 结尾的 OpenAI 兼容 Base URL");
            }
            return normalized;
        } catch (InvalidAiSettings e) {
            throw e;
        } catch (IllegalArgumentException e) {
            throw new InvalidAiSettings("AI 接口地址格式不正确");
        }
    }

    public static class InvalidAiSettings extends IllegalArgumentException {
        public InvalidAiSettings(String message) { super(message); }
    }
}
