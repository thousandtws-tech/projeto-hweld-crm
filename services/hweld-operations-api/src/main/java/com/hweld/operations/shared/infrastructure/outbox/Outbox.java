package com.hweld.operations.shared.infrastructure.outbox;

import com.hweld.operations.shared.application.IntegrationEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Port de escrita na outbox — persiste o evento na MESMA transação da mutação
 * de negócio (Transactional Outbox). O relay assíncrono faz o fan-out.
 */
@Component
public class Outbox {

    private static final Logger log = LoggerFactory.getLogger(Outbox.class);

    private final OutboxEventRepository repository;

    public Outbox(OutboxEventRepository repository) {
        this.repository = repository;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void publish(String aggregateType, String aggregateId, IntegrationEvent event) {
        repository.save(new OutboxEventEntity(
                event.eventId(), aggregateType, aggregateId,
                event.eventType(), event.eventVersion(),
                correlationOrMdc(event), event.payload()));
        log.info("evento publicado: {} ({}) aggregate={} corr={}",
                event.eventType(), event.eventId(), aggregateId, correlationOrMdc(event));
    }

    private static String correlationOrMdc(IntegrationEvent event) {
        return event.correlationId() != null ? event.correlationId() : MDC.get("correlationId");
    }
}
