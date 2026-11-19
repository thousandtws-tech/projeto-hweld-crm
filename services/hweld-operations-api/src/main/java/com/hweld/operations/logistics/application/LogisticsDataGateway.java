package com.hweld.operations.logistics.application;

import java.math.BigDecimal;
import java.util.List;

/**
 * Port de leitura do pedido no core-api para montar a cotação: itens com
 * dimensões/peso do cadastro do produto e CEP de entrega — dados
 * autoritatídicos, nunca digitados no frontend.
 */
public interface LogisticsDataGateway {

    DadosLogisticosPedido buscar(long pedidoId);

    record DadosLogisticosPedido(
            PedidoLogistico pedido,
            List<ItemLogistico> itens,
            /** CEP de entrega (8 dígitos) — null quando o pedido não tem. */
            String cepDestino) {}

    record PedidoLogistico(long id, String numero, String status, long empresaId) {}

    record ItemLogistico(
            String sku,
            String descricao,
            BigDecimal quantidade,
            BigDecimal valorUnitario,
            /** kg — null quando o produto não cadastrou. */
            BigDecimal pesoKg,
            /** cm. */
            BigDecimal alturaCm,
            BigDecimal larguraCm,
            BigDecimal comprimentoCm) {}
}
