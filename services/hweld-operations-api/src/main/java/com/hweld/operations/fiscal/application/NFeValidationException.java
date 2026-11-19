package com.hweld.operations.fiscal.application;

import java.util.List;

/**
 * Validação local de dados fiscais — fail-fast antes de qualquer chamada ao
 * provedor. Os mappers acumulam todos os problemas encontrados e lançam uma
 * única exceção com a lista completa (nunca inventa valor tributário).
 */
public class NFeValidationException extends RuntimeException {

    private final List<String> erros;

    public NFeValidationException(List<String> erros) {
        super("dados fiscais inválidos: " + String.join("; ", erros));
        this.erros = List.copyOf(erros);
    }

    public List<String> erros() {
        return erros;
    }
}
