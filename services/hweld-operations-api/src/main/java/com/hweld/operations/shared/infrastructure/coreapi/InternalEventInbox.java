package com.hweld.operations.shared.infrastructure.coreapi;

import com.hweld.operations.shared.application.IntegrationEvent;
import com.hweld.operations.shared.infrastructure.outbox.Outbox;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Inbox service-to-service: persiste o evento inbound na outbox como
 * `inbound` — o relay o entrega aos handlers internos com deduplicação
 * por (eventId, processor). O re-POST do mesmo evento é seguro.
 */
@Component
public class InternalEventInbox {

    public enum Result { ENQUEUED, DUPLICATE }

    private final Outbox outbox;

    public InternalEventInbox(Outbox outbox) {
        this.outbox = outbox;
    }

    @Transactional
    public Result enqueue(IntegrationEvent event) {
        // O próprio eventId é a chave natural de dedupe: se o evento já foi
        // enfileirado, a PK da outbox colide — tratamos como duplicado.
        try {
            outbox.publish("inbound", event.aggregateId(), event);
            return Result.ENQUEUED;
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            return Result.DUPLICATE;
        }
    }
}
