package com.hweld.operations.notification.application;

import com.hweld.operations.shared.application.EventTypes;
import com.hweld.operations.shared.application.IntegrationEvent;
import com.hweld.operations.shared.application.IntegrationEventHandler;
import java.util.HashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Converte eventos de negócio em e-mails transacionais enfileirados.
 * Sem e-mail do contato no payload → registra e segue (evento não falha por isso).
 */
@Component
public class NotificationEventHandler implements IntegrationEventHandler {

    private static final Logger log = LoggerFactory.getLogger(NotificationEventHandler.class);

    /** eventType → template_code */
    private static final Map<String, String> TEMPLATES = Map.of(
            EventTypes.PAYMENT_REQUESTED, "payment_requested",
            EventTypes.PAYMENT_CONFIRMED, "payment_confirmed",
            EventTypes.PAYMENT_FAILED, "payment_failed",
            EventTypes.INVOICE_AUTHORIZED, "invoice_authorized",
            EventTypes.INVOICE_REJECTED, "invoice_rejected");

    private final NotificationService service;

    public NotificationEventHandler(NotificationService service) {
        this.service = service;
    }

    @Override
    public String name() {
        return "notification";
    }

    @Override
    public boolean supports(String eventType) {
        return TEMPLATES.containsKey(eventType);
    }

    @Override
    public void handle(IntegrationEvent event) {
        String recipient = stringOf(event.payload().get("contatoEmail"));
        if (recipient == null) {
            log.info("notificação {} pulada: contatoEmail ausente no evento {}",
                    event.eventType(), event.eventId());
            return;
        }
        Map<String, Object> vars = new HashMap<>(event.payload());
        service.queue(TEMPLATES.get(event.eventType()), recipient, vars);
    }

    private static String stringOf(Object v) {
        return v instanceof String s && !s.isBlank() ? s : null;
    }
}
