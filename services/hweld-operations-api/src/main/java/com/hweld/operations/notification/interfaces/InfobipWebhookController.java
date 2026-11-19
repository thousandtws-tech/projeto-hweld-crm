package com.hweld.operations.notification.interfaces;

import com.hweld.operations.notification.application.InfobipDlrService;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Inbound DLR do Infobip — público (`/api/v1/webhooks/**`), autenticado pelo
 * segredo gerado no servidor que compõe o path (`/sms/dlr/{segredo}`,
 * comparação constant-time). A URL completa é exibida no card da integração
 * para cadastro no painel Infobip. Idempotente e tolerante a ordem.
 */
@RestController
@RequestMapping("/api/v1/webhooks/infobip")
@Tag(name = "Webhooks Infobip", description = "Delivery reports de SMS")
public class InfobipWebhookController {

    private final InfobipDlrService service;

    public InfobipWebhookController(InfobipDlrService service) {
        this.service = service;
    }

    @PostMapping(value = "/sms/dlr/{segredo}", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<Map<String, Object>> dlr(
            @PathVariable String segredo,
            @RequestBody(required = false) String rawBody) {

        InfobipDlrService.Outcome outcome = service.process(rawBody, segredo);
        return switch (outcome.result()) {
            case PROCESSED -> ResponseEntity.ok(Map.of(
                    "aceito", true,
                    "correlacionados", outcome.matched(),
                    "semCorrelacao", outcome.unmatched()));
            case UNAUTHORIZED -> ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("aceito", false, "erro", "segredo de webhook inválido"));
            case UNCONFIGURED -> ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("aceito", false, "erro", "webhook não configurado"));
            case INVALID_PAYLOAD -> ResponseEntity.badRequest()
                    .body(Map.of("aceito", false, "erro", "payload inválido"));
        };
    }
}
