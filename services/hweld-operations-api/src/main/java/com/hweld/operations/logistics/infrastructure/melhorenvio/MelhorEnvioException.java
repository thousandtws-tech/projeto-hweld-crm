package com.hweld.operations.logistics.infrastructure.melhorenvio;

import com.hweld.operations.logistics.infrastructure.ShippingProviderException;
import java.util.List;
import java.util.Map;

/**
 * Erro tipado da API Melhor Envio v2. Envelope oficial: `{message}` ou
 * `{error, message}` — cotação não é operação com efeito colateral, então
 * transporte é sempre retriável.
 */
public class MelhorEnvioException extends ShippingProviderException {

    private MelhorEnvioException(String codigo, String mensagem, int httpStatus,
            List<Map<String, Object>> erros, boolean retriable, long retryAfterMs) {
        super(codigo, mensagem, httpStatus, erros, retriable, retryAfterMs);
    }

    /** 400/422 — rejeição de dados (CEP inválido, dimensões fora de faixa…). */
    public static MelhorEnvioException validacao(String codigo, String mensagem,
            int httpStatus, List<Map<String, Object>> erros) {
        return new MelhorEnvioException(codigo, mensagem, httpStatus, erros, false, 0);
    }

    /** 401/403 — Bearer token inválido, expirado ou de outro ambiente. */
    public static MelhorEnvioException autenticacao(String mensagem, int httpStatus) {
        return new MelhorEnvioException("autenticacao", mensagem, httpStatus, List.of(),
                false, 0);
    }

    /** 404 — recurso desconhecido no Melhor Envio. */
    public static MelhorEnvioException naoEncontrado(String mensagem) {
        return new MelhorEnvioException("nao_encontrado", mensagem, 404, List.of(),
                false, 0);
    }

    /** 429 — rate limit do Melhor Envio. */
    public static MelhorEnvioException rateLimit(String mensagem, long retryAfterMs) {
        return new MelhorEnvioException("rate_limit", mensagem, 429, List.of(), true,
                retryAfterMs);
    }

    /** 5xx ou indisponibilidade do Melhor Envio. */
    public static MelhorEnvioException provedor(String mensagem, int httpStatus) {
        return new MelhorEnvioException("provedor_indisponivel", mensagem, httpStatus,
                List.of(), true, 0);
    }

    /** Timeout/erro de transporte — cotação não tem efeito colateral: retriável. */
    public static MelhorEnvioException transporte(String mensagem) {
        return new MelhorEnvioException("transporte", mensagem, 0, List.of(), true, 0);
    }
}
