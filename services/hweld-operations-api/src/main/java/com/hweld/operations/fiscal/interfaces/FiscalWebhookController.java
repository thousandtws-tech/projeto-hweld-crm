package com.hweld.operations.fiscal.interfaces;

import com.hweld.operations.fiscal.application.SpedyWebhookService;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/webhooks/fiscal")
@Tag(name = "Webhooks Fiscais", description = "Notificações de status fiscal")
public class FiscalWebhookController {

    private final SpedyWebhookService spedyService;

    public FiscalWebhookController(SpedyWebhookService spedyService) {
        this.spedyService = spedyService;
    }

    @PostMapping(value = "/spedy", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<Map<String, Object>> spedy(
            @RequestBody(required = false) String rawBody,
            @RequestHeader HttpHeaders headers) {

        SpedyWebhookService.Result result = spedyService.process(rawBody,
                headers.getFirst("webhook-id"),
                headers.getFirst("webhook-timestamp"),
                headers.getFirst("webhook-signature"));
        return switch (result) {
            case PROCESSED -> ResponseEntity.ok(Map.of("aceito", true, "resultado", "processed"));
            case NO_CHANGE -> ResponseEntity.ok(Map.of("aceito", true, "resultado", "no_change"));
            case DUPLICATE -> ResponseEntity.ok(Map.of("aceito", true, "duplicado", true));
            case IGNORED -> ResponseEntity.ok(Map.of("aceito", true, "resultado", "ignored"));
            case REJECTED -> ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("aceito", false, "erro", "assinatura de webhook inválida"));
        };
    }
}
