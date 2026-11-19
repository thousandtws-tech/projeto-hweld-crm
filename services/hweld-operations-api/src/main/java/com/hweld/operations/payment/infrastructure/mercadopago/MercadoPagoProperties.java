package com.hweld.operations.payment.infrastructure.mercadopago;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** `hweld.payment.mercadopago.*` — timeout do client HTTP. */
@ConfigurationProperties(prefix = "hweld.payment.mercadopago")
public record MercadoPagoProperties(int timeoutMs) {
    public MercadoPagoProperties {
        if (timeoutMs <= 0) timeoutMs = 10000;
    }
}
