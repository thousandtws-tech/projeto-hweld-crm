package com.hweld.operations.shared.infrastructure.coreapi;

import com.hweld.operations.shared.domain.Money;
import java.math.BigDecimal;

/**
 * Port de leitura do pedido no core-api. A chamada repassa o JWT do usuário:
 * portal → `/api/v1/portal/pedidos/{id}` + `/api/v1/portal/me`;
 * staff  → `/api/v1/pedidos/{id}` — a posse/visibilidade é enforced pelo Rust.
 */
public interface OrderGateway {

    record OrderInfo(long pedidoId, String numero, String status, long empresaId,
            Long contatoId, Money total, String contatoEmail) {}

    /** @throws com.hweld.operations.shared.interfaces.error.ApiException 404/403 quando inacessível */
    OrderInfo getOrder(long pedidoId, String callerJwt, boolean portalContext);

    /** Perfil do contato portal autenticado (empresa + e-mail para notificações). */
    PortalProfile getPortalProfile(String callerJwt);

    record PortalProfile(long contatoId, long empresaId, String email, String nomeContato) {}
}
