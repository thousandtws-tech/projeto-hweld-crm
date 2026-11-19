package com.hweld.operations.notification.application;

/**
 * Falha tipada do provider SMS — `kind` determina a política do dispatcher:
 * TRANSIENT/RATE_LIMIT → retry (RATE_LIMIT honra `retryAfterMs`); os demais
 * → DEAD imediato (credencial, permissão, remetente e restrições não se
 * resolvem com nova tentativa).
 */
public class SmsSendException extends RuntimeException {

    public enum Kind {
        TRANSIENT, RATE_LIMIT, INVALID_CREDENTIALS, NO_PERMISSION,
        INVALID_SENDER, ACCOUNT_RESTRICTION, PERMANENT
    }

    private final Kind kind;
    private final Long retryAfterMs;

    public SmsSendException(Kind kind, String message) {
        this(kind, message, null, null);
    }

    public SmsSendException(Kind kind, String message, Long retryAfterMs) {
        this(kind, message, retryAfterMs, null);
    }

    public SmsSendException(Kind kind, String message, Long retryAfterMs, Throwable cause) {
        super(message, cause);
        this.kind = kind;
        this.retryAfterMs = retryAfterMs;
    }

    public Kind kind() { return kind; }
    public Long retryAfterMs() { return retryAfterMs; }

    public boolean isRetryable() {
        return kind == Kind.TRANSIENT || kind == Kind.RATE_LIMIT;
    }
}
