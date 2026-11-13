package com.hweld.operations.shared.infrastructure.coreapi;

import com.hweld.operations.shared.application.IntegrationEvent;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Canal inbound service-to-service (Rust → Java), auth `X-Service-Token`.
 * Recebe eventos de domínio (ex.: OrderCreated, PaymentRequested) no envelope
 * padrão e os enfileira na outbox local para processamento idempotente —
 * reuso do mecanismo único de fan-out/deduplicação.
 */
@RestController
@RequestMapping("/api/v1/internal")
public class InternalEventsController {

    private static final Logger log = LoggerFactory.getLogger(InternalEventsController.class);

    private final InternalEventInbox inbox;

    public InternalEventsController(InternalEventInbox inbox) {
        this.inbox = inbox;
    }

    public record InboundEvent(
            String eventId,
            String eventType,
            Integer eventVersion,
            String aggregateId,
            String correlationId,
            String occurredAt,
            Map<String, Object> payload) {}

    @PostMapping("/events")
    public ResponseEntity<Map<String, Object>> receive(@RequestBody InboundEvent body) {
        if (body.eventType() == null || body.eventType().isBlank()) {
            return ResponseEntity.unprocessableEntity()
                    .body(Map.of("erro", Map.of("codigo", "validacao", "mensagem", "eventType é obrigatório")));
        }
        UUID eventId = parseUuid(body.eventId());
        IntegrationEvent event = new IntegrationEvent(
                eventId != null ? eventId : UUID.randomUUID(),
                body.eventType(),
                body.eventVersion() != null ? body.eventVersion() : 1,
                body.aggregateId() != null ? body.aggregateId() : "",
                body.correlationId(),
                parseInstant(body.occurredAt()),
                body.payload() != null ? body.payload() : Map.of());
        InternalEventInbox.Result result = inbox.enqueue(event);
        log.info("evento recebido do core-api: {} ({}) → {}",
                event.eventType(), event.eventId(), result);
        return ResponseEntity.accepted().body(Map.of(
                "aceito", result == InternalEventInbox.Result.ENQUEUED,
                "duplicado", result == InternalEventInbox.Result.DUPLICATE,
                "eventId", event.eventId().toString()));
    }

    private static UUID parseUuid(String v) {
        try {
            return v != null ? UUID.fromString(v) : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static Instant parseInstant(String v) {
        try {
            return v != null ? Instant.parse(v) : Instant.now();
        } catch (Exception e) {
            return Instant.now();
        }
    }
}
