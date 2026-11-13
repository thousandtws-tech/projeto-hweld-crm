package com.hweld.operations.shared.interfaces.error;

import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * Envelope de erro consistente com o core-api Rust:
 * `{ "erro": { "codigo": "...", "mensagem": "...", "campos": [...]? } }`.
 * Interno nunca vaza a fonte — vai para o log.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    record ErroCorpo(Map<String, Object> erro) {
        static ErroCorpo of(String codigo, String mensagem) {
            return new ErroCorpo(Map.of("codigo", codigo, "mensagem", mensagem));
        }
        static ErroCorpo comCampos(String mensagem, List<Map<String, String>> campos) {
            return new ErroCorpo(Map.of("codigo", "validacao", "mensagem", mensagem, "campos", campos));
        }
    }

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ErroCorpo> api(ApiException e) {
        if (e.status().is5xxServerError()) {
            log.error("erro 5xx [{}]: {}", e.codigo(), e.getMessage(), e);
        } else {
            log.warn("erro {} [{}]: {}", e.status().value(), e.codigo(), e.getMessage());
        }
        return ResponseEntity.status(e.status()).body(ErroCorpo.of(e.codigo(), e.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ErroCorpo> validacao(MethodArgumentNotValidException e) {
        List<Map<String, String>> campos = e.getBindingResult().getFieldErrors().stream()
                .map(f -> Map.of("campo", f.getField(), "mensagem",
                        f.getDefaultMessage() != null ? f.getDefaultMessage() : "inválido"))
                .toList();
        return ResponseEntity.unprocessableEntity()
                .body(ErroCorpo.comCampos("campos inválidos", campos));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ErroCorpo> corpoInvalido(HttpMessageNotReadableException e) {
        return ResponseEntity.badRequest().body(ErroCorpo.of("corpo_invalido", "corpo da requisição inválido"));
    }

    @ExceptionHandler(MissingRequestHeaderException.class)
    ResponseEntity<ErroCorpo> headerAusente(MissingRequestHeaderException e) {
        return ResponseEntity.badRequest()
                .body(ErroCorpo.of("header_ausente", "header obrigatório ausente: " + e.getHeaderName()));
    }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<ErroCorpo> proibido(AccessDeniedException e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ErroCorpo.of("proibido", "perfil sem permissão para esta operação"));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ErroCorpo> naoEncontrado(NoResourceFoundException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ErroCorpo.of("nao_encontrado", "recurso não encontrado"));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ErroCorpo> interno(Exception e) {
        log.error("erro interno não tratado", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ErroCorpo.of("interno", "erro interno"));
    }
}
