package com.hweld.operations.notification.infrastructure.infobip;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuração Infobip (infobip.com/docs) — credenciais exclusivamente por
 * env (`INFOBIP_*`), padrão FocusNFe. `baseUrl` é específica da conta
 * (ex.: `https://xxxxxx.api.infobip.com`) e DEVE ser HTTPS — URL insegura
 * falha na carga da aplicação.
 *
 * Prefixo: `hweld.notification.infobip`.
 */
@ConfigurationProperties(prefix = "hweld.notification.infobip")
public record InfobipProperties(
        String baseUrl,
        String apiKey,
        String sender,
        long timeoutMs,
        String dlrAuthToken,
        String dlrAuthHeader,
        String webhookUrl) {

    public InfobipProperties {
        if (baseUrl != null && !baseUrl.isBlank()) {
            if (!baseUrl.startsWith("https://")) {
                throw new IllegalStateException(
                        "hweld.notification.infobip.base-url deve ser HTTPS — recusado: " + baseUrl);
            }
            baseUrl = baseUrl.endsWith("/")
                    ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        }
        if (timeoutMs <= 0) timeoutMs = 10_000;
        if (dlrAuthHeader == null || dlrAuthHeader.isBlank()) {
            dlrAuthHeader = "X-DLR-Token";
        }
    }

    /** Credenciais mínimas para ativar o provider `infobip`. */
    public boolean configured() {
        return baseUrl != null && !baseUrl.isBlank()
                && apiKey != null && !apiKey.isBlank()
                && sender != null && !sender.isBlank();
    }
}
