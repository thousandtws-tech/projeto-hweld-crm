package com.hweld.operations.notification.application;

import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.notification.domain.NotificationDelivery;
import com.hweld.operations.notification.domain.NotificationDeliveryRepository;
import com.hweld.operations.shared.application.EventTypes;
import com.hweld.operations.shared.application.IntegrationEvent;
import com.hweld.operations.shared.application.IntegrationEventHandler;
import com.hweld.operations.shared.infrastructure.coreapi.ContatoGateway;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Converte eventos de negócio em WhatsApp transacionais enfileirados via
 * Z-API — paralelo ao `SmsNotificationEventHandler`, mesmo pipeline
 * (fila/outbox/retry). Reusa os corpos de texto dos templates `sms_*` —
 * o canal muda, a mensagem não. Dupla trava `enabled` + gatilho por evento
 * na linha `zapi-whatsapp`; dedup com prefixo `wa:` para não colidir
 * com o SMS do mesmo evento.
 */
@Component
public class WhatsAppNotificationEventHandler implements IntegrationEventHandler {

    private static final Logger log = LoggerFactory.getLogger(WhatsAppNotificationEventHandler.class);

    private static final Map<String, String> TEMPLATES = Map.of(
            EventTypes.ORDER_CREATED, "sms_order_created",
            EventTypes.PAYMENT_REQUESTED, "sms_payment_requested",
            EventTypes.PAYMENT_CONFIRMED, "sms_payment_confirmed",
            EventTypes.PAYMENT_FAILED, "sms_payment_failed",
            EventTypes.PAYMENT_EXPIRED, "sms_payment_expired",
            EventTypes.INVOICE_AUTHORIZED, "sms_invoice_authorized");

    private static final Map<String, String> SUPPRESSES = Map.of(
            EventTypes.PAYMENT_CONFIRMED, "sms_payment_requested",
            EventTypes.PAYMENT_EXPIRED, "sms_payment_requested",
            EventTypes.PAYMENT_CANCELLED, "sms_payment_requested");

    private final NotificationService service;
    private final IntegrationSettingsRepository settings;
    private final NotificationDeliveryRepository deliveries;
    private final ContatoGateway contatos;

    public WhatsAppNotificationEventHandler(NotificationService service,
            IntegrationSettingsRepository settings,
            NotificationDeliveryRepository deliveries,
            ContatoGateway contatos) {
        this.service = service;
        this.settings = settings;
        this.deliveries = deliveries;
        this.contatos = contatos;
    }

    @Override
    public String name() {
        return "notification-whatsapp";
    }

    @Override
    public boolean supports(String eventType) {
        return TEMPLATES.containsKey(eventType);
    }

    @Override
    public void handle(IntegrationEvent event) {
        suppressObsoletes(event);

        IntegrationSettings cfg = settings.findById(IntegrationSettings.ZAPI_WHATSAPP).orElse(null);
        if (cfg == null || !cfg.isEventEnabled(event.eventType())) {
            return;
        }

        String phone = stringOf(event.payload().get("contatoTelefone"));
        if (phone == null) {
            Long contatoId = longOf(event.payload().get("contatoId"));
            if (contatoId != null) {
                ContatoGateway.ContatoNotificacao c = contatos.getContato(contatoId);
                phone = c != null ? c.telefone() : null;
            }
        }
        if (phone == null) {
            log.info("whatsapp {} pulado: contato sem telefone (evento {})",
                    event.eventType(), event.eventId());
            return;
        }

        Map<String, Object> vars = new HashMap<>(event.payload());
        service.queueWhatsApp(TEMPLATES.get(event.eventType()), phone, vars,
                "wa:" + event.eventId(), event.eventId().toString(),
                longOf(event.payload().get("pedidoId")));
    }

    private void suppressObsoletes(IntegrationEvent event) {
        String supprimible = SUPPRESSES.get(event.eventType());
        Long pedidoId = longOf(event.payload().get("pedidoId"));
        if (supprimible == null || pedidoId == null) return;
        List<NotificationDelivery> pendentes = deliveries.findSupprimable(
                "WHATSAPP", pedidoId, supprimible);
        for (NotificationDelivery d : pendentes) {
            d.markSuppressed("obsoleto após " + event.eventType());
            deliveries.save(d);
            log.info("whatsapp delivery {} suprimida por {} (pedido {})",
                    d.getId(), event.eventType(), pedidoId);
        }
    }

    private static String stringOf(Object v) {
        return v instanceof String s && !s.isBlank() ? s : null;
    }

    private static Long longOf(Object v) {
        if (v instanceof Number n) return n.longValue();
        if (v instanceof String s) {
            try { return Long.parseLong(s); } catch (NumberFormatException ignored) {}
        }
        return null;
    }
}
