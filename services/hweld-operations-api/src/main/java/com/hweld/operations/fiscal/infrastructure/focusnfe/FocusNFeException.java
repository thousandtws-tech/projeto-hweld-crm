package com.hweld.operations.fiscal.infrastructure.focusnfe;

import com.hweld.operations.fiscal.infrastructure.FiscalProviderException;
import java.util.List;
import java.util.Map;

/**
 * Erro tipado da integração Focus NFe. `codigo`/`erros` preservam os campos
 * oficiais do envelope de erro `{codigo, mensagem, erros[]}` da API v2.
 * `retriable` marca falhas transitórias (429, 5xx, transporte) — emissão
 * inconclusiva (timeout pós-POST) NÃO é retriável: exige reconciliação
 * pela referência antes de qualquer reenvio.
 */
public class FocusNFeException extends FiscalProviderException {

    private FocusNFeException(String codigo, String mensagem, int httpStatus,
            List<Map<String, Object>> erros, boolean retriable, boolean inconclusivo,
            long retryAfterMs) {
        super(codigo, mensagem, httpStatus, erros, retriable, inconclusivo, retryAfterMs);
    }

    /** 400/422 — rejeição de dados ou regra do provedor (não reenviar). */
    public static FocusNFeException validacao(String codigo, String mensagem,
            int httpStatus, List<Map<String, Object>> erros) {
        return new FocusNFeException(codigo, mensagem, httpStatus, erros, false, false, 0);
    }

    /** 401/403 — credencial/token inválido ou empresa não autorizada. */
    public static FocusNFeException autenticacao(String mensagem, int httpStatus) {
        return new FocusNFeException("autenticacao", mensagem, httpStatus, List.of(),
                false, false, 0);
    }

    /** 404 — referência desconhecida no provedor. */
    public static FocusNFeException naoEncontrado(String mensagem) {
        return new FocusNFeException("nao_encontrado", mensagem, 404, List.of(), false, false, 0);
    }

    /** 429 — rate limit do provedor (100 req/min/token). */
    public static FocusNFeException rateLimit(String mensagem, long retryAfterMs) {
        return new FocusNFeException("rate_limit", mensagem, 429, List.of(), true, false,
                retryAfterMs);
    }

    /** 5xx ou indisponibilidade explícita do provedor. */
    public static FocusNFeException provedor(String mensagem, int httpStatus) {
        return new FocusNFeException("provedor_indisponivel", mensagem, httpStatus, List.of(),
                true, false, 0);
    }

    /**
     * Timeout/erro de transporte. `inconclusivo` em POST: a Focus pode ter
     * recebido — nunca reenviar sem antes reconciliar pela referência.
     */
    public static FocusNFeException transporte(String mensagem, boolean inconclusivo) {
        return new FocusNFeException("transporte", mensagem, 0, List.of(), !inconclusivo,
                inconclusivo, 0);
    }
}
