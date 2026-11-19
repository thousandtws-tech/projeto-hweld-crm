package com.hweld.operations.payment.infrastructure.mercadopago;

/**
 * Erro tipado da API Mercado Pago (Payments/Checkout Preferences API).
 * Mesma semântica de `PagBankException`: escrita com timeout/5xx é
 * INCONCLUSIVA — o MP pode ter recebido a cobrança (X-Idempotency-Key
 * protege reenvios da MESMA operação; payload diferente nunca reutiliza
 * a chave). Reconciliar via `GET /v1/payments/{id}` antes de repetir.
 */
public class MercadoPagoException extends RuntimeException {

    public enum Kind { VALIDATION, AUTH, NOT_FOUND, RATE_LIMIT, PROVIDER, TRANSPORT, INCONCLUSIVE }

    private final Kind kind;
    private final int httpStatus;
    private final long retryAfterMs;

    private MercadoPagoException(Kind kind, String message, int httpStatus, long retryAfterMs) {
        super(message);
        this.kind = kind;
        this.httpStatus = httpStatus;
        this.retryAfterMs = retryAfterMs;
    }

    public Kind kind() { return kind; }
    public int httpStatus() { return httpStatus; }
    public long retryAfterMs() { return retryAfterMs; }
    public boolean retryable() {
        return kind == Kind.RATE_LIMIT || kind == Kind.PROVIDER || kind == Kind.TRANSPORT;
    }

    /** 400/422 — payload inválido (valor, método, expiração, payer…). */
    public static MercadoPagoException validacao(String mensagem, int httpStatus) {
        return new MercadoPagoException(Kind.VALIDATION, mensagem, httpStatus, 0);
    }

    /** 401/403 — Access Token inválido, expirado ou de outro ambiente. */
    public static MercadoPagoException autenticacao(String mensagem, int httpStatus) {
        return new MercadoPagoException(Kind.AUTH, mensagem, httpStatus, 0);
    }

    /** 404 — payment/preference desconhecido no Mercado Pago. */
    public static MercadoPagoException naoEncontrado(String mensagem) {
        return new MercadoPagoException(Kind.NOT_FOUND, mensagem, 404, 0);
    }

    /** 429 — rate limit do Mercado Pago. */
    public static MercadoPagoException rateLimit(String mensagem, long retryAfterMs) {
        return new MercadoPagoException(Kind.RATE_LIMIT, mensagem, 429, retryAfterMs);
    }

    /** 5xx ou indisponibilidade do Mercado Pago. */
    public static MercadoPagoException provedor(String mensagem, int httpStatus) {
        return new MercadoPagoException(Kind.PROVIDER, mensagem, httpStatus, 0);
    }

    /**
     * Falha de transporte em LEITURA (consulta/webhook fetch) — seguro
     * tentar de novo, sem efeito colateral no PSP.
     */
    public static MercadoPagoException transporte(String mensagem) {
        return new MercadoPagoException(Kind.TRANSPORT, mensagem, 0, 0);
    }

    /**
     * Falha de transporte em ESCRITA (criar/cancelar/estornar) — NÃO
     * reenviar: a cobrança pode existir no MP. Reconciliar antes de retry.
     */
    public static MercadoPagoException inconclusivo(String mensagem) {
        return new MercadoPagoException(Kind.INCONCLUSIVE, mensagem, 0, 0);
    }
}
