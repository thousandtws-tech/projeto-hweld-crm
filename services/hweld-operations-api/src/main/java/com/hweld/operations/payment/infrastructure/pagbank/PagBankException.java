package com.hweld.operations.payment.infrastructure.pagbank;

/**
 * Erro tipado da API PagBank (Orders API).
 * Categorias espelham `FiscalProviderException.Kind`/`MelhorEnvioException`:
 * escrita com timeout/5xx é INCONCLUSIVA — o PagBank pode ter recebido a
 * cobrança; reconciliar via `GET /charges/{id}`/`GET /orders/{id}` em vez
 * de reenviar cegamente.
 */
public class PagBankException extends RuntimeException {

    public enum Kind { VALIDATION, AUTH, NOT_FOUND, RATE_LIMIT, PROVIDER, TRANSPORT, INCONCLUSIVE }

    private final Kind kind;
    private final int httpStatus;
    private final long retryAfterMs;

    private PagBankException(Kind kind, String message, int httpStatus, long retryAfterMs) {
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

    /** 400/422 — payload inválido (valor, método, expiração, customer…). */
    public static PagBankException validacao(String mensagem, int httpStatus) {
        return new PagBankException(Kind.VALIDATION, mensagem, httpStatus, 0);
    }

    /** 401/403 — Bearer token inválido, expirado ou de outro ambiente. */
    public static PagBankException autenticacao(String mensagem, int httpStatus) {
        return new PagBankException(Kind.AUTH, mensagem, httpStatus, 0);
    }

    /** 404 — order/charge desconhecido no PagBank. */
    public static PagBankException naoEncontrado(String mensagem) {
        return new PagBankException(Kind.NOT_FOUND, mensagem, 404, 0);
    }

    /** 429 — rate limit do PagBank. */
    public static PagBankException rateLimit(String mensagem, long retryAfterMs) {
        return new PagBankException(Kind.RATE_LIMIT, mensagem, 429, retryAfterMs);
    }

    /** 5xx ou indisponibilidade do PagBank. */
    public static PagBankException provedor(String mensagem, int httpStatus) {
        return new PagBankException(Kind.PROVIDER, mensagem, httpStatus, 0);
    }

    /**
     * Falha de transporte em LEITURA (consulta/webhook fetch-back) — seguro
     * tentar de novo, sem efeito colateral no PSP.
     */
    public static PagBankException transporte(String mensagem) {
        return new PagBankException(Kind.TRANSPORT, mensagem, 0, 0);
    }

    /**
     * Falha de transporte em ESCRITA (criar/cancelar) — NÃO reenviar:
     * a cobrança pode existir no PagBank. Reconciliar antes de retry.
     */
    public static PagBankException inconclusivo(String mensagem) {
        return new PagBankException(Kind.INCONCLUSIVE, mensagem, 0, 0);
    }
}
