package com.hweld.operations.shared.interfaces.error;

import org.springframework.http.HttpStatus;

/**
 * Erro de aplicação tipado — vira o envelope
 * `{"erro":{"codigo","mensagem","campos"?}}` (mesmo formato do core-api).
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String codigo;

    public ApiException(HttpStatus status, String codigo, String mensagem) {
        super(mensagem);
        this.status = status;
        this.codigo = codigo;
    }

    public HttpStatus status() { return status; }
    public String codigo() { return codigo; }

    public static ApiException naoEncontrado(String mensagem) {
        return new ApiException(HttpStatus.NOT_FOUND, "nao_encontrado", mensagem);
    }

    public static ApiException conflito(String mensagem) {
        return new ApiException(HttpStatus.CONFLICT, "conflito", mensagem);
    }

    public static ApiException proibido(String mensagem) {
        return new ApiException(HttpStatus.FORBIDDEN, "proibido", mensagem);
    }

    public static ApiException validacao(String mensagem) {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "validacao", mensagem);
    }

    public static ApiException provedorIndisponivel(String mensagem) {
        return new ApiException(HttpStatus.BAD_GATEWAY, "provedor_indisponivel", mensagem);
    }
}
