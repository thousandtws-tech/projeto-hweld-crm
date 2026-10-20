package com.hweld.operations.fiscal.application;

import java.math.BigDecimal;
import java.util.List;

/**
 * Port de leitura dos dados fiscais autoritatídicos no core-api — pedido,
 * itens (com ncm/cfop/unidade resolvidos server-side), empresa destinatária
 * e endereço de faturamento. O operations-api nunca lê o banco do core-api;
 * os dados vêm do endpoint interno autenticado por `X-Service-Token`.
 */
public interface FiscalDataGateway {

    /**
     * Busca o conjunto fiscal do pedido. `notaFiscalId` opcional — quando
     * presente, o snapshot da NF (`nota_fiscal_itens`) é a fonte dos campos
     * tributários por item.
     */
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
