package com.hweld.operations.payment.infrastructure.pagbank;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** `hweld.payment.pagbank.*` — timeout do client HTTP. */
@ConfigurationProperties(prefix = "hweld.payment.pagbank")
public record PagBankProperties(int timeoutMs) {
    public PagBankProperties {
        if (timeoutMs <= 0) timeoutMs = 10000;
    }
}
