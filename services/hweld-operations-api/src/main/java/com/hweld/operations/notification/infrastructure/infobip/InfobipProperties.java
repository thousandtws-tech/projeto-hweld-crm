package com.hweld.operations.notification.infrastructure.infobip;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Ajustes de infraestrutura da integração Infobip — NÃO guarda credenciais
 * (estas são do cliente, cifradas em `integration_settings`). `publicBaseUrl`
 * monta a URL de callback DLR exibida no painel; sem ele a URL só aparece
 * derivada do request do admin.
 *
 * Prefixo: `hweld.notification.infobip`.
 */
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
