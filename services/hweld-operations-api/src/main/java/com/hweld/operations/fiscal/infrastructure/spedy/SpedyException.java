package com.hweld.operations.fiscal.infrastructure.spedy;

import com.hweld.operations.fiscal.infrastructure.FiscalProviderException;
import java.util.List;
import java.util.Map;

public class SpedyException extends FiscalProviderException {

    private SpedyException(String codigo, String mensagem, int httpStatus,
            List<Map<String, Object>> erros, boolean retriable, boolean inconclusivo,
            long retryAfterMs) {
        super(codigo, mensagem, httpStatus, erros, retriable, inconclusivo, retryAfterMs);
    }

    public static SpedyException validacao(String codigo, String mensagem,
            int httpStatus, List<Map<String, Object>> erros) {
        return new SpedyException(codigo, mensagem, httpStatus, erros, false, false, 0);
    }

    public static SpedyException autenticacao(String mensagem, int httpStatus) {
        return new SpedyException("autenticacao", mensagem, httpStatus, List.of(),
                false, false, 0);
    }

    public static SpedyException naoEncontrado(String mensagem) {
        return new SpedyException("nao_encontrado", mensagem, 404, List.of(), false, false, 0);
    }

    public static SpedyException rateLimit(String mensagem, long retryAfterMs) {
        return new SpedyException("rate_limit", mensagem, 429, List.of(), true, false,
                retryAfterMs);
    }

    public static SpedyException provedor(String mensagem, int httpStatus) {
        return new SpedyException("provedor_indisponivel", mensagem, httpStatus, List.of(),
                true, false, 0);
    }

    public static SpedyException transporte(String mensagem, boolean inconclusivo) {
        return new SpedyException("transporte", mensagem, 0, List.of(), !inconclusivo,
                inconclusivo, 0);
    }
}
