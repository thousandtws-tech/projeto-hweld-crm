package com.hweld.operations.order.application;

import com.hweld.operations.order.domain.OrderProjection;
import com.hweld.operations.order.domain.OrderProjectionRepository;
import com.hweld.operations.shared.application.EventTypes;
import com.hweld.operations.shared.application.IntegrationEvent;
import com.hweld.operations.shared.application.IntegrationEventHandler;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Handler `OrderCreated` (Rust → Java): mantém a projeção local de pedidos
 * (`order_projections`) — read-model para joins do dashboard e resolução
 * de empresa/total sem callback ao core-api. Upsert por `pedido_id` torna
 * o processamento idempotente.
 */
@Component
public class OrderCreatedHandler implements IntegrationEventHandler {

    private static final Logger log = LoggerFactory.getLogger(OrderCreatedHandler.class);

    private final OrderProjectionRepository repo;

    public OrderCreatedHandler(OrderProjectionRepository repo) {
        this.repo = repo;
    }

    @Override
    public String name() {
        return "order-projection";
    }

    @Override
    public boolean supports(String eventType) {
        return EventTypes.ORDER_CREATED.equals(eventType);
    }

    @Override
    public void handle(IntegrationEvent event) {
        Map<String, Object> p = event.payload();
        Long pedidoId = numero(p.get("pedidoId"));
        if (pedidoId == null) {
            throw new IllegalArgumentException("OrderCreated sem pedidoId");
        }

        OrderProjection proj = repo.findById(pedidoId).orElseGet(() -> OrderProjection.criar(pedidoId));
        proj.sincronizar(
                uuid(p.get("publicId")),
                texto(p.get("numero")),
                numero(p.get("empresaId")),
                numero(p.get("contatoId")),
                decimal(p.get("total")),
                texto(p.getOrDefault("status", "aguardando_pagamento")),
                texto(p.getOrDefault("origem", "desconhecida")),
                texto(p.get("condicaoPagamento")));
        repo.save(proj);
        log.info("projeção de pedido sincronizada: pedido={} numero={} ({})",
                pedidoId, proj.getNumero(), event.eventId());
    }

    private static Long numero(Object v) {
        return v instanceof Number n ? n.longValue() : v != null ? Long.parseLong(v.toString()) : null;
    }

    private static BigDecimal decimal(Object v) {
        return v != null ? new BigDecimal(v.toString()) : BigDecimal.ZERO;
    }

    private static UUID uuid(Object v) {
        try {
            return v != null ? UUID.fromString(v.toString()) : null;
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static String texto(Object v) {
        return v != null ? v.toString() : null;
    }
}
