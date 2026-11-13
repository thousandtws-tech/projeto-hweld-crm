package com.hweld.operations.payment.application;

import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "hweld.payment")
public record PaymentProperties(
        String defaultProvider,
        Map<String, String> webhookSecrets,
        int pixExpirationMinutes,
        boolean allowUnsignedStubWebhook) {

    public PaymentProperties {
        if (defaultProvider == null || defaultProvider.isBlank()) defaultProvider = "stub";
        if (webhookSecrets == null) webhookSecrets = Map.of();
        if (pixExpirationMinutes <= 0) pixExpirationMinutes = 30;
    }

    public String webhookSecret(String provider) {
        return webhookSecrets.getOrDefault(provider, "");
    }
}
