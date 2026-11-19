package com.hweld.operations.logistics.application;

import java.math.BigDecimal;
import java.util.List;

public interface LogisticsDataGateway {

    DadosLogisticosPedido buscar(long pedidoId);

    record DadosLogisticosPedido(
            PedidoLogistico pedido,
            List<ItemLogistico> itens,
            String cepDestino) {}

    record PedidoLogistico(long id, String numero, String status, long empresaId) {}

    record ItemLogistico(
            String sku,
            String descricao,
            BigDecimal quantidade,
            BigDecimal valorUnitario,
            BigDecimal pesoKg,
            BigDecimal alturaCm,
            BigDecimal larguraCm,
            BigDecimal comprimentoCm) {}
}
