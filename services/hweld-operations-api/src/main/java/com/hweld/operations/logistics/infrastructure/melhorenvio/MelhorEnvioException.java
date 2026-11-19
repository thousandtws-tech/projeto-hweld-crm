package com.hweld.operations.logistics.infrastructure.melhorenvio;

import com.hweld.operations.logistics.infrastructure.ShippingProviderException;
import java.util.List;
import java.util.Map;

public class MelhorEnvioException extends ShippingProviderException {

    private MelhorEnvioException(String codigo, String mensagem, int httpStatus,
            List<Map<String, Object>> erros, boolean retriable, long retryAfterMs) {
        super(codigo, mensagem, httpStatus, erros, retriable, retryAfterMs);
    }

    public static MelhorEnvioException validacao(String codigo, String mensagem,
            int httpStatus, List<Map<String, Object>> erros) {
        return new MelhorEnvioException(codigo, mensagem, httpStatus, erros, false, 0);
    }

    public static MelhorEnvioException autenticacao(String mensagem, int httpStatus) {
        return new MelhorEnvioException("autenticacao", mensagem, httpStatus, List.of(),
                false, 0);
    }

    public static MelhorEnvioException naoEncontrado(String mensagem) {
        return new MelhorEnvioException("nao_encontrado", mensagem, 404, List.of(),
                false, 0);
    }

    public static MelhorEnvioException rateLimit(String mensagem, long retryAfterMs) {
        return new MelhorEnvioException("rate_limit", mensagem, 429, List.of(), true,
                retryAfterMs);
    }

    public static MelhorEnvioException provedor(String mensagem, int httpStatus) {
        return new MelhorEnvioException("provedor_indisponivel", mensagem, httpStatus,
                List.of(), true, 0);
    }

    public static MelhorEnvioException transporte(String mensagem) {
        return new MelhorEnvioException("transporte", mensagem, 0, List.of(), true, 0);
    }
}
