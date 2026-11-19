package com.hweld.operations.fiscal.infrastructure.spedy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.hweld.operations.fiscal.application.FiscalDataGateway.DadosFiscaisPedido;
import com.hweld.operations.fiscal.application.FiscalDataGateway.EmpresaFiscal;
import com.hweld.operations.fiscal.application.FiscalDataGateway.EnderecoFiscal;
import com.hweld.operations.fiscal.application.FiscalDataGateway.ItemFiscal;
import com.hweld.operations.fiscal.application.FiscalDataGateway.PedidoFiscal;
import com.hweld.operations.fiscal.infrastructure.focusnfe.FocusNFeProperties;
import com.hweld.operations.fiscal.infrastructure.focusnfe.FocusNFeProperties.NfeDefaults;
import com.hweld.operations.fiscal.infrastructure.focusnfe.NFeMapper.NFeValidationException;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SpedyNFeMapperTest {

    private static NfeDefaults defaults() {
        return new NfeDefaults("Venda de mercadoria", "5102", "UN", 1, 1, 9, 9,
                false, null, "102", "07", "07", 0);
    }

    private static SpedyNFeMapper mapper() {
        var props = new FocusNFeProperties("homologacao", null, null, "tok", null,
                false, 30_000, 15_000, null, null, null, null, defaults());
        return new SpedyNFeMapper(props);
    }

    private static EmpresaFiscal empresa() {
        return new EmpresaFiscal(7L, "Cliente Soldas SA", "Cliente",
                "44.555.666/0001-77", "998877", "1130001000", "c@cliente.com");
    }

    private static EnderecoFiscal endereco() {
        return new EnderecoFiscal("Av. Central", "500", null, "Centro",
                "São Paulo", "SP", "01000-000");
    }

    private static ItemFiscal item() {
        return new ItemFiscal("E7018", "Eletrodo E-7018 3,25mm",
                new BigDecimal("2"), new BigDecimal("50.00"), BigDecimal.ZERO,
                new BigDecimal("100.00"), "83111000", "5102", "CX");
    }

    private static DadosFiscaisPedido dados() {
        var pedido = new PedidoFiscal(42L, "PV-0042", "faturado",
                new BigDecimal("100.00"), BigDecimal.ZERO, BigDecimal.ZERO,
                new BigDecimal("100.00"));
        return new DadosFiscaisPedido(pedido, List.of(item()), empresa(), endereco(), null);
    }

    @Test
    @SuppressWarnings("unchecked")
    void montaPayloadNoContratoOficial() {
        Map<String, Object> body = mapper().montar("doc-uuid-1", dados(), Map.of());

        assertThat(body.get("integrationId")).isEqualTo("doc-uuid-1");
        assertThat(body.get("operationNature")).isEqualTo("Venda de mercadoria");
        assertThat(body.get("isFinalCustomer")).isEqualTo(false); // NfeDefaults consumidorFinal=false

        var receiver = (Map<String, Object>) body.get("receiver");
        assertThat(receiver.get("federalTaxNumber")).isEqualTo("44555666000177");
        assertThat(receiver.get("stateTaxNumber")).isEqualTo("998877");
        assertThat(receiver.get("email")).isEqualTo("c@cliente.com");
        var address = (Map<String, Object>) receiver.get("address");
        assertThat(address.get("postalCode")).isEqualTo("01000000");
        var city = (Map<String, Object>) address.get("city");
        assertThat(city.get("state")).isEqualTo("SP");

        var items = (List<Map<String, Object>>) body.get("items");
        assertThat(items).hasSize(1);
        var it = items.get(0);
        assertThat(it.get("code")).isEqualTo("E7018");
        assertThat(it.get("ncm")).isEqualTo("83111000");
        assertThat(it.get("cfop")).isEqualTo(5102);
        assertThat(it.get("unitTax")).isEqualTo("CX"); // espelha unidade comercial
        var taxes = (Map<String, Object>) it.get("taxes");
        var icms = (Map<String, Object>) taxes.get("icms");
        assertThat(icms.get("csosn")).isEqualTo(102); // 3 dígitos → csosn
        var pis = (Map<String, Object>) taxes.get("pis");
        assertThat(pis.get("cst")).isEqualTo(7);

        var payments = (List<Map<String, Object>>) body.get("payments");
        assertThat(payments.get(0).get("method")).isEqualTo("bankDeposit");

        assertThat(body).doesNotContainKey("transport"); // sem frete → sem bloco
    }

    @Test
    void rejeitaDestinatarioSemCnpj() {
        var empInvalida = new EmpresaFiscal(7L, "X", "X", null, null, null, null);
        var pedido = new PedidoFiscal(42L, "PV", "ok", BigDecimal.TEN,
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.TEN);
        var d = new DadosFiscaisPedido(pedido, List.of(item()), empInvalida, endereco(), null);
        assertThatThrownBy(() -> mapper().montar("doc-1", d, Map.of()))
                .isInstanceOf(NFeValidationException.class)
                .hasMessageContaining("federalTaxNumber");
    }

    @Test
    void rejeitaItemSemNcm() {
        var semNcm = new ItemFiscal("X", "Produto", BigDecimal.ONE, BigDecimal.TEN,
                BigDecimal.ZERO, BigDecimal.TEN, null, "5102", "UN");
        var pedido = new PedidoFiscal(42L, "PV", "ok", BigDecimal.TEN,
                BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.TEN);
        var d = new DadosFiscaisPedido(pedido, List.of(semNcm), empresa(), endereco(), null);
        assertThatThrownBy(() -> mapper().montar("doc-1", d, Map.of()))
                .isInstanceOf(NFeValidationException.class)
                .hasMessageContaining("ncm");
    }

    @Test
    @SuppressWarnings("unchecked")
    void freteGeraBlocoTransport() {
        var pedido = new PedidoFiscal(42L, "PV", "ok", new BigDecimal("100.00"),
                BigDecimal.ZERO, new BigDecimal("15.00"), new BigDecimal("115.00"));
        var d = new DadosFiscaisPedido(pedido, List.of(item()), empresa(), endereco(), null);
        Map<String, Object> body = mapper().montar("doc-1", d, Map.of());
        assertThat(body.get("transport")).isEqualTo(Map.of("freightModality", 0));
    }

    @Test
    @SuppressWarnings("unchecked")
    void overridePaymentsViaSuplemento() {
        Map<String, Object> body = mapper().montar("doc-1", dados(),
                Map.of("metodo_pagamento", "pix"));
        var payments = (List<Map<String, Object>>) body.get("payments");
        assertThat(payments.get(0).get("method")).isEqualTo("pix");
    }
}
