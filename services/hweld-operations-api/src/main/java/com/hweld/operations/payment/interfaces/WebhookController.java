package com.hweld.operations.payment.interfaces;

import com.hweld.operations.payment.application.WebhookService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Inbound de webhooks de PSP — sem JWT (endpoint público); a autenticidade é
 * a assinatura HMAC validada pelo adapter do provedor. Idempotente por
 * (provider, event_id): reenvios respondem 200 com `duplicado`.
 */
@RestController
@RequestMapping("/api/v1/webhooks")
@Tag(name = "Webhooks", description = "Callbacks assinados dos provedores de pagamento")
public class WebhookController {

    private final WebhookService service;

    public WebhookController(WebhookService service) {
        this.service = service;
    }

    @PostMapping(value = "/{provider}", consumes = MediaType.ALL_VALUE)
    @Operation(summary = "Recebe webhook do provedor (valida assinatura, dedupe, aplica transição)")
    public ResponseEntity<Map<String, Object>> receive(
            @PathVariable String provider,
            @RequestBody String rawBody,
            @RequestHeader(value = "X-Signature", required = false) String signature,
            @RequestHeader(value = "X-Hub-Signature", required = false) String hubSignature) {

        String sig = signature != null ? signature : hubSignature;
        WebhookService.Result result = service.process(provider, rawBody, sig);
        return switch (result) {
            case PROCESSED -> ResponseEntity.ok(Map.of("aceito", true, "resultado", "processed"));
            case DUPLICATE -> ResponseEntity.ok(Map.of("aceito", true, "duplicado", true));
            case IGNORED -> ResponseEntity.ok(Map.of("aceito", true, "resultado", "ignored"));
            case REJECTED -> ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("aceito", false, "erro", "assinatura inválida"));
        };
    }
}
