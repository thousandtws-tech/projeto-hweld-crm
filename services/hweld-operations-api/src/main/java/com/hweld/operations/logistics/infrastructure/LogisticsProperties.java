package com.hweld.operations.logistics.infrastructure;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Ajustes de plataforma do contexto logístico — `hweld.logistics.*`.
 * `provider`: `auto` (Melhor Envio se credenciada no banco, senão stub),
 * `stub` (cotações sintéticas de dev) ou `melhorenvio` (força o adapter).
 * Credenciais NÃO vivem aqui — ficam cifradas em `integration_settings`.
 * `userAgent` é obrigatório na API do Melhor Envio (app + e-mail de contato).
 */
@ConfigurationProperties(prefix = "hweld.logistics")
public record LogisticsProperties(
        String provider,
        long timeoutMs,
        String userAgent) {

    public LogisticsProperties {
        if (provider == null || provider.isBlank()) provider = "auto";
        if (timeoutMs <= 0) timeoutMs = 15_000;
        if (userAgent == null || userAgent.isBlank()) {
            userAgent = "HWeld Operations (contato@hweld.com.br)";
        }
    }
}
