package com.hweld.operations.fiscal.infrastructure;

import java.util.List;
import java.util.Map;

/**
 * Erro tipado comum dos adapters `FiscalProvider` (Focus NFe, Spedy, ...).
 *
 * `codigo`/`erros` preservam os campos do envelope de erro do provedor.
 * `retriable` marca falhas transitórias (429, 5xx, transporte) — emissão
 * inconclusiva (timeout pós-POST) NÃO é retriável: exige reconciliação
 * pela referência antes de qualquer reenvio.
 */
public class FiscalProviderException extends RuntimeException {

    private final String codigo;
    private final int httpStatus;
    private final List<Map<String, Object>> erros;
    private final boolean retriable;
    private final boolean inconclusivo;
    private final long retryAfterMs;

    protected FiscalProviderException(String codigo, String mensagem, int httpStatus,
            List<Map<String, Object>> erros, boolean retriable, boolean inconclusivo,
            long retryAfterMs) {
        super(mensagem);
        this.codigo = codigo;
        this.httpStatus = httpStatus;
        this.erros = erros == null ? List.of() : erros;
        this.retriable = retriable;
        this.inconclusivo = inconclusivo;
        this.retryAfterMs = retryAfterMs;
    }

    public String codigo() { return codigo; }
    public int httpStatus() { return httpStatus; }
    public List<Map<String, Object>> erros() { return erros; }
    public boolean retriable() { return retriable; }
    public boolean inconclusivo() { return inconclusivo; }
    public long retryAfterMs() { return retryAfterMs; }

    /** Primeira mensagem de erro detalhada, quando existir. */
    public String primeiraMensagem() {
        if (!erros.isEmpty()) {
            Object m = erros.get(0).get("mensagem");
            if (m != null) return m.toString();
            Object msg = erros.get(0).get("message");
            if (msg != null) return msg.toString();
        }
        return getMessage();
    }
}
