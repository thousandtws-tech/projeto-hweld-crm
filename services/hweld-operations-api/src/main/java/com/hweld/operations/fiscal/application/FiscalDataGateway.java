package com.hweld.operations.fiscal.application;

import java.math.BigDecimal;
import java.util.List;

public interface FiscalDataGateway {

    DadosFiscaisPedido buscar(long pedidoId, Long notaFiscalId);

    record DadosFiscaisPedido(
            PedidoFiscal pedido,
            List<ItemFiscal> itens,
            EmpresaFiscal empresa,
            EnderecoFiscal enderecoFaturamento,
            NotaFiscalResumo notaFiscal) {}

    record PedidoFiscal(
            long id,
            String numero,
            String status,
            BigDecimal subtotal,
            BigDecimal desconto,
            BigDecimal frete,
            BigDecimal total) {}

    record ItemFiscal(
            String codigo,
            String descricao,
            BigDecimal quantidade,
            BigDecimal valorUnitario,
            BigDecimal desconto,
            BigDecimal valorTotal,
            String ncm,
            String cfop,
            String unidade) {}

    record EmpresaFiscal(
            long id,
            String razaoSocial,
            String nomeFantasia,
            String cnpj,
            String inscricaoEstadual,
            String telefone,
            String email) {}

    record EnderecoFiscal(
            String logradouro,
            String numero,
            String complemento,
            String bairro,
            String cidade,
            String uf,
            String cep) {}

    record NotaFiscalResumo(
            long id,
            String numero,
            String serie,
            String naturezaOperacao,
            String cfop,
            String status) {}
}
