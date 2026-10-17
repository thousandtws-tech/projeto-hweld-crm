package com.hweld.operations.shared.infrastructure.coreapi;

import com.hweld.operations.shared.application.EventTypes;
import com.hweld.operations.shared.application.IntegrationEvent;
import com.hweld.operations.shared.application.IntegrationEventHandler;
import com.hweld.operations.shared.infrastructure.http.HttpClientsConfig.CoreApiProps;
import com.hweld.operations.shared.infrastructure.security.SecurityProperties;
import com.hweld.operations.shared.infrastructure.security.ServiceTokenFilter;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Sink da outbox → `POST {CORE_API_URL}/api/v1/internal/eventos-financeiros`
 * (endpoint aditivo no Rust, auth `X-Service-Token`): sincronização de estado
 * financeiro — baixa de parcela/status do pedido após PaymentConfirmed, etc.
 */
@Component
public class CoreApiEventSink implements IntegrationEventHandler {

    private static final Logger log = LoggerFactory.getLogger(CoreApiEventSink.class);

    private static final Set<String> SUPORTADOS = Set.of(
            EventTypes.PAYMENT_CONFIRMED,
            EventTypes.PAYMENT_FAILED,
            EventTypes.PAYMENT_CANCELLED,
            EventTypes.PAYMENT_EXPIRED,
            EventTypes.REFUND_COMPLETED,
            EventTypes.INVOICE_AUTHORIZED,
            EventTypes.INVOICE_REJECTED,
            EventTypes.INVOICE_FISCAL_CANCELLED);

    private final RestClient client;
    private final SecurityProperties security;

    public CoreApiEventSink(@Qualifier("coreApiClient") RestClient client, SecurityProperties security) {
        this.client = client;
        this.security = security;
    }

    @Override
    public String name() {
        return "core-api";
    }

    @Override
    public boolean supports(String eventType) {
        return SUPORTADOS.contains(eventType);
    }

    @Override
    public void handle(IntegrationEvent event) {
        Map<String, Object> body = Map.of(
                "eventId", event.eventId().toString(),
                "eventType", event.eventType(),
                "eventVersion", event.eventVersion(),
                "aggregateId", event.aggregateId(),
                "correlationId", event.correlationId() != null ? event.correlationId() : "",
                "occurredAt", event.occurredAt().toString(),
                "payload", event.payload());
        client.post().uri("/api/v1/internal/eventos-financeiros")
                .header(ServiceTokenFilter.HEADER, security.internalServiceToken())
                .body(body)
                .retrieve()
                .toBodilessEntity();
        log.info("core-api: evento {} entregue ({})", event.eventType(), event.eventId());
    }
}
