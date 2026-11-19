package com.hweld.operations.fiscal.interfaces;

import com.hweld.operations.fiscal.application.FiscalWebhookService;
import com.hweld.operations.fiscal.application.SpedyWebhookService;
import com.hweld.operations.fiscal.infrastructure.focusnfe.FocusNFeProperties;
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

/**
 * Inbound do webhook da Focus NFe — endpoint público (`/api/v1/webhooks/**`),
 * autenticado pelo segredo `authorization` enviado no header configurado no
 * gatilho (`authorization_header`, default `X-Webhook-Token`). Idempotente:
 * reenvios respondem 200 com `duplicado`.
 */
@RestController
@RequestMapping("/api/v1/webhooks/fiscal")
@Tag(name = "Webhooks Fiscais", description = "Notificações da Focus NFe")
public class FiscalWebhookController {

    private final FiscalWebhookService service;
    private final SpedyWebhookService spedyService;
    private final FocusNFeProperties props;

    public FiscalWebhookController(FiscalWebhookService service,
            SpedyWebhookService spedyService, FocusNFeProperties props) {
        this.service = service;
        this.spedyService = spedyService;
        this.props = props;
    }

    @PostMapping(value = "/focus", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<Map<String, Object>> focus(
            @RequestBody(required = false) String rawBody,
            @RequestHeader HttpHeaders headers) {

        String auth = headers.getFirst(props.webhookAuthHeader());
        FiscalWebhookService.Result result = service.process(rawBody, auth);
        return switch (result) {
            case PROCESSED -> ResponseEntity.ok(Map.of("aceito", true, "resultado", "processed"));
            case NO_CHANGE -> ResponseEntity.ok(Map.of("aceito", true, "resultado", "no_change"));
            case DUPLICATE -> ResponseEntity.ok(Map.of("aceito", true, "duplicado", true));
            case IGNORED -> ResponseEntity.ok(Map.of("aceito", true, "resultado", "ignored"));
            case REJECTED -> ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("aceito", false, "erro", "credencial de webhook inválida"));
        };
    }

    /**
     * Inbound do webhook da Spedy — Standard Webhooks: `webhook-id`,
     * `webhook-timestamp`, `webhook-signature: v1,<b64>` sobre
     * `{id}.{ts}.{corpo cru}` com o segredo `whsec_` da conta. Idempotente:
     * retentativas respondem 200 com `duplicado`.
     */
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
