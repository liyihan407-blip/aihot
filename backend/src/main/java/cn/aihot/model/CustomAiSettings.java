package cn.aihot.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** 一次手动检索使用的模型设置，密钥仅在请求期间使用。 */
public record CustomAiSettings(
    @NotBlank @Size(max = 500) String baseUrl,
    @NotBlank @Size(max = 256) String model,
    @NotBlank @Size(max = 512) String apiKey
) {
    @Override public String toString() { return "CustomAiSettings[redacted]"; }
}
