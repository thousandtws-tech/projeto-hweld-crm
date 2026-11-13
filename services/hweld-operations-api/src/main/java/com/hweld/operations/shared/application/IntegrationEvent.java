package com.hweld.operations.shared.application;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Envelope padrão de evento de integração (ver docs/business-operations-architecture.md §4.3).
 * `payload` é Map para serialização JSONB direta no outbox.
 */
public record IntegrationEvent(
        UUID eventId,
        String eventType,
        int eventVersion,
        String aggregateId,
        String correlationId,
        Instant occurredAt,
        Map<String, Object> payload) {

    public static IntegrationEvent of(String type, String aggregateId, Map<String, Object> payload, String correlationId) {
        return new IntegrationEvent(UUID.randomUUID(), type, 1, aggregateId, correlationId, Instant.now(), payload);
    }
}
