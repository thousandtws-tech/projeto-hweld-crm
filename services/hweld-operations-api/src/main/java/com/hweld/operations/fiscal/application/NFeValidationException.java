package com.hweld.operations.fiscal.application;

import java.util.List;

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
