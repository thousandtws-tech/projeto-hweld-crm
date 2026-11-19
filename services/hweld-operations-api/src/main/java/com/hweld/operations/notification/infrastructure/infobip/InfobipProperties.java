package com.hweld.operations.notification.infrastructure.infobip;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "hweld.notification.infobip")
public record InfobipProperties(long timeoutMs, String publicBaseUrl) {

    public InfobipProperties {
        if (timeoutMs <= 0) timeoutMs = 10_000;
        if (publicBaseUrl != null && !publicBaseUrl.isBlank()
                && publicBaseUrl.endsWith("/")) {
            publicBaseUrl = publicBaseUrl.substring(0, publicBaseUrl.length() - 1);
        }
    }
}
