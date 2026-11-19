package com.hweld.operations.fiscal.application;

import com.hweld.operations.fiscal.domain.FiscalDocument;
import com.hweld.operations.shared.application.EventTypes;
import com.hweld.operations.shared.application.IntegrationEvent;
import com.hweld.operations.shared.application.IntegrationEventHandler;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class FiscalEventHandler implements IntegrationEventHandler {

    private static final Logger log = LoggerFactory.getLogger(FiscalEventHandler.class);

    private final FiscalService service;
    private final FiscalService.Props props;

    public FiscalEventHandler(FiscalService service, FiscalService.Props props) {
        this.service = service;
        this.props = props;
    }

    @Override
    public String name() {
        return "fiscal";
    }

    @Override
    public boolean supports(String eventType) {
        return EventTypes.PAYMENT_CONFIRMED.equals(eventType) && props.autoEmitOnPaymentConfirmed();
    }

    @Override
    public void handle(IntegrationEvent event) {
        var p = event.payload();
        long pedidoId = ((Number) p.get("pedidoId")).longValue();
        long empresaId = ((Number) p.get("empresaId")).longValue();
        log.info("fiscal: auto-emissão pedido {} empresa {}", pedidoId, empresaId);
        service.requestEmission(pedidoId, empresaId, null, null,
                FiscalDocument.DocType.NFE, Map.of("origem", "payment_confirmed",
                        "paymentId", p.get("paymentId")));
    }
}
