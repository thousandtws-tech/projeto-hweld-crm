package com.hweld.operations.notification.interfaces;

import com.hweld.operations.notification.application.InfobipDlrService;
import com.hweld.operations.notification.infrastructure.infobip.InfobipProperties;
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
 * Inbound DLR do Infobip — público (`/api/v1/webhooks/**`), autenticado pelo
 * segredo configurado no callback (`X-DLR-Token`, comparação constant-time).
 * Relatórios de mensagens antigas continuam gravados mesmo com envios novos
 * pausados. Idempotente: reenvio do lote apenas repete a mesma transição.
 */
@RestController
@RequestMapping("/api/v1/webhooks/infobip")
@Tag(name = "Webhooks Infobip", description = "Delivery reports de SMS")
public class InfobipWebhookController {

    private final InfobipDlrService service;
    private final InfobipProperties props;

    public InfobipWebhookController(InfobipDlrService service, InfobipProperties props) {
        this.service = service;
        this.props = props;
    }

    @PostMapping(value = "/sms/dlr", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<Map<String, Object>> dlr(
            @RequestBody(required = false) String rawBody,
            @RequestHeader HttpHeaders headers) {

        String auth = headers.getFirst(props.dlrAuthHeader());
        InfobipDlrService.Outcome outcome = service.process(rawBody, auth);
        return switch (outcome.result()) {
            case PROCESSED -> ResponseEntity.ok(Map.of(
                    "aceito", true,
                    "correlacionados", outcome.matched(),
                    "semCorrelacao", outcome.unmatched()));
            case UNAUTHORIZED -> ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("aceito", false, "erro", "credencial de webhook inválida"));
            case UNCONFIGURED -> ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("aceito", false, "erro", "webhook não configurado"));
            case INVALID_PAYLOAD -> ResponseEntity.badRequest()
                    .body(Map.of("aceito", false, "erro", "payload inválido"));
        };
    }
}
