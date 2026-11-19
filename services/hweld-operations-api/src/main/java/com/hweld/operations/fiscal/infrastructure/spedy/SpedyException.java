package com.hweld.operations.fiscal.infrastructure.spedy;

import com.hweld.operations.fiscal.infrastructure.FiscalProviderException;
import java.util.List;
import java.util.Map;

/**
 * Erro tipado da integração Spedy (docs.spedy.com.br). O envelope de erro da
 * API carrega `{statusCode, error, message, details?}`/`{code, message}` —
 * `codigo`/`erros` preservam o que veio, com `SPD*` normalizado quando
 * aplicável.
 */
public class SpedyException extends FiscalProviderException {

    private SpedyException(String codigo, String mensagem, int httpStatus,
            List<Map<String, Object>> erros, boolean retriable, boolean inconclusivo,
            long retryAfterMs) {
        super(codigo, mensagem, httpStatus, erros, retriable, inconclusivo, retryAfterMs);
    }

    /** 400/422 — rejeição de dados ou regra fiscal (não reenviar). */
    public static SpedyException validacao(String codigo, String mensagem,
            int httpStatus, List<Map<String, Object>> erros) {
        return new SpedyException(codigo, mensagem, httpStatus, erros, false, false, 0);
    }

    /** 401/403 — `X-Api-Key` inválida, ausente ou de outro ambiente. */
    public static SpedyException autenticacao(String mensagem, int httpStatus) {
        return new SpedyException("autenticacao", mensagem, httpStatus, List.of(),
                false, false, 0);
    }

    /** 404 — nota/recurso desconhecido na Spedy. */
    public static SpedyException naoEncontrado(String mensagem) {
        return new SpedyException("nao_encontrado", mensagem, 404, List.of(), false, false, 0);
    }

    /** 429 — rate limit da Spedy. */
    public static SpedyException rateLimit(String mensagem, long retryAfterMs) {
        return new SpedyException("rate_limit", mensagem, 429, List.of(), true, false,
                retryAfterMs);
    }

    /** 5xx ou indisponibilidade da Spedy/SEFAZ. */
    public static SpedyException provedor(String mensagem, int httpStatus) {
        return new SpedyException("provedor_indisponivel", mensagem, httpStatus, List.of(),
                true, false, 0);
    }

    /**
     * Timeout/erro de transporte. `inconclusivo` em POST/DELETE: a Spedy pode
     * ter recebido — nunca reenviar sem reconciliar pelo `integrationId`.
     */
    public static SpedyException transporte(String mensagem, boolean inconclusivo) {
        return new SpedyException("transporte", mensagem, 0, List.of(), !inconclusivo,
                inconclusivo, 0);
    }
}
