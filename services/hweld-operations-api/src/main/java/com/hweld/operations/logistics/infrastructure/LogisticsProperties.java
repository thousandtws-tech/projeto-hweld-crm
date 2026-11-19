package com.hweld.operations.logistics.infrastructure;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "hweld.logistics")
public record LogisticsProperties(
        String provider,
        long timeoutMs,
        String userAgent) {

    public LogisticsProperties {
        if (provider == null || provider.isBlank())
            provider = "auto";
        if (timeoutMs <= 0)
            timeoutMs = 15_000;
        if (userAgent == null || userAgent.isBlank()) {
            userAgent = "HWeld Operations (contato@hweld.com.br)";
        }
    }
}
