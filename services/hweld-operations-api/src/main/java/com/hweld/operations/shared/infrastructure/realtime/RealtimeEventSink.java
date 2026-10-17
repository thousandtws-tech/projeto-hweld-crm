package com.hweld.operations.shared.infrastructure.realtime;

import com.hweld.operations.shared.application.EventTypes;
import com.hweld.operations.shared.application.IntegrationEvent;
import com.hweld.operations.shared.application.IntegrationEventHandler;
import com.hweld.operations.shared.infrastructure.http.HttpClientsConfig.MotorProps;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Sink da outbox → `POST {MOTOR_URL}/ingest` do realtime-engine, mesmo envelope
 * do Rust: `{tipo, audiencia:{escopo, empresa_id?}, dados}`.
 * Tipos de UI mapeados para `entidade.acao` em pt-BR (convenção do barramento).
 */
@Component
public class RealtimeEventSink implements IntegrationEventHandler {

    private static final Logger log = LoggerFactory.getLogger(RealtimeEventSink.class);

    /** tipo realtime ← eventType interno */
    private static final Map<String, String> TIPOS = Map.ofEntries(
            Map.entry(EventTypes.ORDER_CREATED, "pedido.criado"),
            Map.entry(EventTypes.PAYMENT_REQUESTED, "pagamento.solicitado"),
            Map.entry(EventTypes.PAYMENT_CONFIRMED, "pagamento.confirmado"),
            Map.entry(EventTypes.PAYMENT_FAILED, "pagamento.falhou"),
            Map.entry(EventTypes.PAYMENT_CANCELLED, "pagamento.cancelado"),
            Map.entry(EventTypes.PAYMENT_EXPIRED, "pagamento.expirado"),
            Map.entry(EventTypes.REFUND_COMPLETED, "pagamento.estornado"),
            Map.entry(EventTypes.INVOICE_ISSUED, "fatura.emitida"),
            Map.entry(EventTypes.INVOICE_PAID, "fatura.paga"),
            Map.entry(EventTypes.INVOICE_OVERDUE, "fatura.vencida"),
            Map.entry(EventTypes.INVOICE_CANCELLED, "fatura.cancelada"),
            Map.entry(EventTypes.FISCAL_DOC_REQUESTED, "nf.solicitada"),
            Map.entry(EventTypes.INVOICE_AUTHORIZED, "nf.autorizada"),
            Map.entry(EventTypes.INVOICE_REJECTED, "nf.rejeitada"),
            Map.entry(EventTypes.INVOICE_FISCAL_CANCELLED, "nf.cancelada"),
            Map.entry(EventTypes.NOTIFICATION_SENT, "notificacao.enviada"),
            Map.entry(EventTypes.NOTIFICATION_FAILED, "notificacao.falhou"));

    private final RestClient client;
    private final MotorProps props;

    public RealtimeEventSink(@Qualifier("motorClient") RestClient client, MotorProps props) {
        this.client = client;
        this.props = props;
    }

    @Override
    public String name() {
        return "realtime-ingest";
    }

    @Override
    public boolean supports(String eventType) {
        return TIPOS.containsKey(eventType);
    }

    @Override
    public void handle(IntegrationEvent event) {
        String token = props.token();
        if (token == null || token.isBlank()) {
            // Motor desligado é configuração válida — descarta como o Rust faz.
            log.debug("realtime descartado: MOTOR_INGEST_TOKEN ausente (evento {})", event.eventType());
            return;
        }
        Object empresaId = event.payload().get("empresaId");
        Map<String, Object> audiencia = empresaId != null
                ? Map.of("escopo", "empresa", "empresa_id", empresaId)
                : Map.of("escopo", "staff");
        Map<String, Object> body = Map.of(
                "tipo", TIPOS.get(event.eventType()),
                "audiencia", audiencia,
                "dados", event.payload());
        client.post().uri("/ingest")
                .header("Authorization", "Bearer " + token)
                .body(body)
                .retrieve()
                .toBodilessEntity();
        log.info("realtime: evento {} entregue ({})", event.eventType(), event.eventId());
    }
}
