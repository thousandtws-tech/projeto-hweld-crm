package com.hweld.operations.billing.application;

import com.hweld.operations.billing.domain.BillingInvoice;
import com.hweld.operations.shared.application.EventTypes;
import com.hweld.operations.shared.application.IntegrationEvent;
import com.hweld.operations.shared.application.IntegrationEventHandler;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.stereotype.Component;

/**
 * Reage aos eventos do módulo Payment: cria a fatura no PaymentRequested,
 * baixa no PaymentConfirmed, cancela no PaymentCancelled/RefundCompleted.
 * Dedupe por (eventId, "billing") via processed_events.
 */
@Component
public class BillingEventHandler implements IntegrationEventHandler {

    private final BillingService service;

    public BillingEventHandler(BillingService service) {
        this.service = service;
    }

    @Override
    public String name() {
        return "billing";
    }

    @Override
    public boolean supports(String eventType) {
        return switch (eventType) {
            case EventTypes.PAYMENT_REQUESTED, EventTypes.PAYMENT_CONFIRMED,
                 EventTypes.PAYMENT_CANCELLED, EventTypes.REFUND_COMPLETED -> true;
            default -> false;
        };
    }

    @Override
    public void handle(IntegrationEvent event) {
        var p = event.payload();
        switch (event.eventType()) {
            case EventTypes.PAYMENT_REQUESTED -> {
                UUID paymentId = UUID.fromString((String) p.get("paymentId"));
                LocalDate due = p.get("expiresAt") != null
                        ? LocalDate.parse(((String) p.get("expiresAt")).substring(0, 10))
                        : LocalDate.now().plusDays(1);
                service.createFromPayment(paymentId,
                        ((Number) p.get("pedidoId")).longValue(),
                        ((Number) p.get("empresaId")).longValue(),
                        new BigDecimal((String) p.get("amount")),
                        (String) p.get("currency"),
                        due,
                        "Pedido " + p.getOrDefault("pedidoNumero", p.get("pedidoId")));
            }
            case EventTypes.PAYMENT_CONFIRMED ->
                service.markPaidByPayment(UUID.fromString((String) p.get("paymentId")));
            case EventTypes.PAYMENT_CANCELLED, EventTypes.REFUND_COMPLETED ->
                service.cancelByPayment(UUID.fromString((String) p.get("paymentId")));
            default -> {}
        }
    }
}
