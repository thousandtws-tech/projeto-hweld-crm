package com.hweld.operations.notification.interfaces;

import com.hweld.operations.notification.application.ZapiWebhookService;
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
import tools.jackson.databind.ObjectMapper;

/**
 * Webhooks Z-API — público (`/api/v1/webhooks/**`), autenticado pelo segredo
 * gerado no servidor que compõe o path (`/zapi/{segredo}/{evento}`,
 * comparação constant-time). A Z-API não assina payloads — o segredo na URL
 * é o controle compensatório documentado; URLs completas aparecem no card
 * e são registradas automaticamente na instância ao salvar a configuração.
 */
@RestController
@RequestMapping("/api/v1/webhooks/zapi")
@Tag(name = "Webhooks Z-API", description = "Eventos inbound/outbound da instância WhatsApp")
public class ZapiWebhookController {

    private final ZapiWebhookService service;
    private final ObjectMapper mapper;

    public ZapiWebhookController(ZapiWebhookService service, ObjectMapper mapper) {
        this.service = service;
        this.mapper = mapper;
    }

    @PostMapping(value = "/{segredo}/received", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<Map<String, Object>> received(
            @PathVariable String segredo,
            @RequestBody(required = false) String rawBody) {
        return handle(segredo, rawBody, service::received);
    }

    @PostMapping(value = "/{segredo}/delivery", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<Map<String, Object>> delivery(
            @PathVariable String segredo,
            @RequestBody(required = false) String rawBody) {
        return handle(segredo, rawBody, service::delivery);
    }

    @PostMapping(value = "/{segredo}/disconnected", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<Map<String, Object>> disconnected(
            @PathVariable String segredo,
            @RequestBody(required = false) String rawBody) {
        return handle(segredo, rawBody, p -> service.connection(p, false));
    }

    @PostMapping(value = "/{segredo}/connected", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<Map<String, Object>> connected(
            @PathVariable String segredo,
            @RequestBody(required = false) String rawBody) {
        return handle(segredo, rawBody, p -> service.connection(p, true));
    }

    private ResponseEntity<Map<String, Object>> handle(
            String segredo, String rawBody, java.util.function.Consumer<Map<String, Object>> action) {
        return switch (service.checkSecret(segredo)) {
            case UNCONFIGURED -> ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("aceito", false, "erro", "webhook não configurado"));
            case INVALID -> ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("aceito", false, "erro", "segredo de webhook inválido"));
            case OK -> {
                Map<String, Object> payload;
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> parsed = rawBody == null || rawBody.isBlank()
                            ? Map.of() : mapper.readValue(rawBody, Map.class);
                    payload = parsed;
                } catch (Exception e) {
                    yield ResponseEntity.badRequest()
                            .body(Map.of("aceito", false, "erro", "payload inválido"));
                }
                action.accept(payload);
                yield ResponseEntity.ok(Map.of("aceito", true));
            }
        };
    }
}
