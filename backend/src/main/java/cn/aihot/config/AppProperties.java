package cn.aihot.config;



import org.springframework.boot.context.properties.ConfigurationProperties;

/** 集中读取 AI、采集、邮件等运行配置。 */
@ConfigurationProperties("aihot")
public record AppProperties(String aiProvider, String siliconflowApiKey, String siliconflowModel,
    String openrouterApiKey, String openrouterModel, boolean schedulerEnabled, int maxAnalysisPerRun,
    int maxAgeDays, int aiTimeoutSeconds, int sourceTimeoutSeconds, boolean legacyImport,
    String apiToken, String smtpHost, int smtpPort, String smtpUser, String smtpPassword,
    boolean smtpSecure, String notifyEmail, String bailianApiKey, String bailianModel, String bailianBaseUrl) {
    public String provider() {
        if ("bailian".equalsIgnoreCase(aiProvider)) return "bailian";
        if ("openrouter".equalsIgnoreCase(aiProvider)) return "openrouter";
        return "siliconflow";
    }
    public String key() {
        return switch (provider()) {
            case "bailian" -> bailianApiKey;
            case "openrouter" -> openrouterApiKey;
            default -> siliconflowApiKey;
        };
    }
    public String model() {
        return switch (provider()) {
            case "bailian" -> bailianModel;
            case "openrouter" -> openrouterModel;
            default -> siliconflowModel;
        };
    }
    public boolean aiConfigured() {
        return key() != null && !key().isBlank() && !key().matches("(?i)^(your_|example|demo|sk-xxx|<).*");
    }
    public boolean mailConfigured() {
        return smtpHost != null && !smtpHost.isBlank() && smtpUser != null && !smtpUser.isBlank()
            && smtpPassword != null && !smtpPassword.isBlank() && notifyEmail != null && !notifyEmail.isBlank();
    }
}
