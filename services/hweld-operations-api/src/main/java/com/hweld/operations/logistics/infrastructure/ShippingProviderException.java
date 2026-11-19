package com.hweld.operations.logistics.infrastructure;

import java.util.List;
import java.util.Map;

/**
 * Erro tipado comum dos adapters `ShippingProvider` (Melhor Envio, ...).
 * `retriable` marca falhas transitórias (429, 5xx, transporte de leitura).
 * Cotação é operação de leitura — nunca `inconclusivo` como nas emissões
 * fiscais: timeout num POST de cálculo não gera efeito colateral.
 */
public class ShippingProviderException extends RuntimeException {

    private final String codigo;
    private final int httpStatus;
    private final List<Map<String, Object>> erros;
    private final boolean retriable;
    private final long retryAfterMs;

    protected ShippingProviderException(String codigo, String mensagem, int httpStatus,
            List<Map<String, Object>> erros, boolean retriable, long retryAfterMs) {
        super(mensagem);
        this.codigo = codigo;
        this.httpStatus = httpStatus;
        this.erros = erros == null ? List.of() : erros;
        this.retriable = retriable;
        this.retryAfterMs = retryAfterMs;
    }

    public String codigo() { return codigo; }
    public int httpStatus() { return httpStatus; }
    public List<Map<String, Object>> erros() { return erros; }
    public boolean retriable() { return retriable; }
    public long retryAfterMs() { return retryAfterMs; }
}
