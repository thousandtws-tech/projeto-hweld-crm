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
 * Converte eventos de negócio em SMS transacionais enfileirados — paralelo
 * ao `NotificationEventHandler` (e-mail), nunca o substitui. Dupla trava:
 * master `enabled` + gatilho por evento em `integration_settings` — todos
 * nascem desligados (V8 seed). Telefone vem do payload (`contatoTelefone`,
 * congelado no Payment) ou resolve via `contatoId` → core-api interno.
 */
@Component
public class SmsNotificationEventHandler implements IntegrationEventHandler {

    private static final Logger log = LoggerFactory.getLogger(SmsNotificationEventHandler.class);

    /** eventType → template_code SMS */
    private static final Map<String, String> TEMPLATES = Map.of(
            EventTypes.ORDER_CREATED, "sms_order_created",
            EventTypes.PAYMENT_REQUESTED, "sms_payment_requested",
            EventTypes.PAYMENT_CONFIRMED, "sms_payment_confirmed",
            EventTypes.PAYMENT_FAILED, "sms_payment_failed",
            EventTypes.PAYMENT_EXPIRED, "sms_payment_expired",
            EventTypes.INVOICE_AUTHORIZED, "sms_invoice_authorized");

    /** Evento → pendências SMS que ele torna obsoletas no mesmo pedido. */
    private static final Map<String, String> SUPPRESSES = Map.of(
            EventTypes.PAYMENT_CONFIRMED, "sms_payment_requested",
            EventTypes.PAYMENT_EXPIRED, "sms_payment_requested",
            EventTypes.PAYMENT_CANCELLED, "sms_payment_requested");

    private final NotificationService service;
    private final IntegrationSettingsRepository settings;
    private final NotificationDeliveryRepository deliveries;
    private final ContatoGateway contatos;

    public SmsNotificationEventHandler(NotificationService service,
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
        return "notification-sms";
    }

    @Override
    public boolean supports(String eventType) {
        return TEMPLATES.containsKey(eventType);
    }

    @Override
    public void handle(IntegrationEvent event) {
        suppressObsoletes(event);

        IntegrationSettings cfg = settings.findById(IntegrationSettings.INFOBIP_SMS).orElse(null);
        if (cfg == null || !cfg.isEventEnabled(event.eventType())) {
            return; // gatilho desligado — comportamento padrão (zero SMS)
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
            log.info("sms {} pulado: contato sem telefone (evento {})",
                    event.eventType(), event.eventId());
            return;
        }

        Map<String, Object> vars = new HashMap<>(event.payload());
        service.queueSms(TEMPLATES.get(event.eventType()), phone, vars,
                "sms:" + event.eventId(), event.eventId().toString(),
                longOf(event.payload().get("pedidoId")), cfg.getMaxSegments());
    }

    /** Confirmação/expiração de pagamento torna a pendência de cobrança obsoleta. */
    private void suppressObsoletes(IntegrationEvent event) {
        String supprimible = SUPPRESSES.get(event.eventType());
        Long pedidoId = longOf(event.payload().get("pedidoId"));
        if (supprimible == null || pedidoId == null) return;
        List<NotificationDelivery> pendentes = deliveries.findSmsSupprimable(pedidoId, supprimible);
        for (NotificationDelivery d : pendentes) {
            d.markSuppressed("obsoleto após " + event.eventType());
            deliveries.save(d);
            log.info("sms delivery {} suprimida por {} (pedido {})",
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
