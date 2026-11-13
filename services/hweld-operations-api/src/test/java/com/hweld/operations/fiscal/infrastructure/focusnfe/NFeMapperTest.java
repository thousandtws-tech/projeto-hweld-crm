package com.hweld.operations.fiscal.infrastructure.focusnfe;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.hweld.operations.fiscal.application.FiscalDataGateway.DadosFiscaisPedido;
import com.hweld.operations.fiscal.application.FiscalDataGateway.EmpresaFiscal;
import com.hweld.operations.fiscal.application.FiscalDataGateway.EnderecoFiscal;
import com.hweld.operations.fiscal.application.FiscalDataGateway.ItemFiscal;
import com.hweld.operations.fiscal.application.FiscalDataGateway.NotaFiscalResumo;
import com.hweld.operations.fiscal.application.FiscalDataGateway.PedidoFiscal;
import com.hweld.operations.fiscal.infrastructure.focusnfe.FocusNFeProperties.Emitente;
import com.hweld.operations.fiscal.infrastructure.focusnfe.FocusNFeProperties.NfeDefaults;
import com.hweld.operations.fiscal.infrastructure.focusnfe.NFeMapper.NFeValidationException;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class NFeMapperTest {

    private static Emitente emitente() {
        return new Emitente("11222333000181", "HWeld Soldas LTDA", "HWeld",
                "123456789", "Rua das Indústrias", "100", "Distrito Industrial",
                "Guarulhos", "SP", "07000000", 1, null);
    }

    private static NfeDefaults defaults() {
        return new NfeDefaults("Venda de mercadoria", "5102", "UN", 1, 1, 9, 9,
                false, null, "102", "07", "07", 0);
    }

    private static FocusNFeProperties props(Emitente emitente, NfeDefaults nfe) {
        return new FocusNFeProperties("homologacao", null, null, "tok", null,
                false, 30_000, 15_000, null, null, null, emitente, nfe);
    }

    private static EmpresaFiscal empresa() {
        return new EmpresaFiscal(7L, "Cliente Soldas SA", "Cliente",
                "44.555.666/0001-77", "998877", "1130001000", "c@cliente.com");
    }

    private static EnderecoFiscal endereco() {
        return new EnderecoFiscal("Av. Central", "500", null, "Centro",
                "São Paulo", "SP", "01000-000");
    }

    private static ItemFiscal item(String ncm, String cfop) {
        return new ItemFiscal("E7018", "Eletrodo E-7018 3,25mm",
                new BigDecimal("2"), new BigDecimal("50.00"), BigDecimal.ZERO,
                new BigDecimal("100.00"), ncm, cfop, "CX");
    }

    private static DadosFiscaisPedido dados(EmpresaFiscal emp, EnderecoFiscal end,
            List<ItemFiscal> itens, BigDecimal total, BigDecimal desconto,
            BigDecimal frete) {
        var pedido = new PedidoFiscal(42L, "PV-0042", "faturado",
                new BigDecimal("100.00"), desconto, frete, total);
        return new DadosFiscaisPedido(pedido, itens, emp, end, null);
    }

    @Test
    void payloadCompletoComCamposOficiais() {
        var mapper = new NFeMapper(props(emitente(), defaults()));
        var d = dados(empresa(), endereco(), List.of(item("83111000", "5102")),
                new BigDecimal("100.00"), BigDecimal.ZERO, BigDecimal.ZERO);

        Map<String, Object> body = mapper.montar(d, Map.of());

        assertThat(body.get("natureza_operacao")).isEqualTo("Venda de mercadoria");
        assertThat(body.get("cnpj_emitente")).isEqualTo("11222333000181");
        assertThat(body.get("nome_emitente")).isEqualTo("HWeld Soldas LTDA");
        assertThat(body.get("regime_tributario_emitente")).isEqualTo(1);
        assertThat(body.get("cnpj_destinatario")).isEqualTo("44555666000177");
        assertThat(body.get("cep_destinatario")).isEqualTo("01000000");
        assertThat(body.get("uf_destinatario")).isEqualTo("SP");
        // UF emitente == UF destinatário → operação interna
        assertThat(body.get("local_destino")).isEqualTo(1);
        assertThat((BigDecimal) body.get("valor_produtos")).isEqualByComparingTo("100.00");
        assertThat((BigDecimal) body.get("valor_total")).isEqualByComparingTo("100.00");

        @SuppressWarnings("unchecked")
        var items = (List<Map<String, Object>>) body.get("items");
        assertThat(items).hasSize(1);
        var it = items.get(0);
        assertThat(it.get("codigo_ncm")).isEqualTo("83111000");
        assertThat(it.get("cfop")).isEqualTo("5102");
        assertThat(it.get("unidade_comercial")).isEqualTo("CX");
        assertThat(it.get("icms_situacao_tributaria")).isEqualTo("102");
        assertThat((BigDecimal) it.get("valor_bruto")).isEqualByComparingTo("100.00");
    }

    @Test
    void descontoDeItemSomaAoDescontoTotal() {
        var mapper = new NFeMapper(props(emitente(), defaults()));
        var it = new ItemFiscal("E7018", "Eletrodo", new BigDecimal("2"),
                new BigDecimal("50"), new BigDecimal("10"), new BigDecimal("90"),
                "83111000", "5102", "CX");
        // total = produtos(100) - desc(10) + frete(0) = 90
        var d = dados(empresa(), endereco(), List.of(it),
                new BigDecimal("90.00"), BigDecimal.ZERO, BigDecimal.ZERO);

        var body = mapper.montar(d, Map.of());
        assertThat((BigDecimal) body.get("valor_desconto")).isEqualByComparingTo("10.00");
        assertThat((BigDecimal) body.get("valor_total")).isEqualByComparingTo("90.00");
    }

    @Test
    void totalInconsistenteRejeitaAntesDoPost() {
        var mapper = new NFeMapper(props(emitente(), defaults()));
        var d = dados(empresa(), endereco(), List.of(item("83111000", "5102")),
                new BigDecimal("77.00"), BigDecimal.ZERO, BigDecimal.ZERO);

        assertThatThrownBy(() -> mapper.montar(d, Map.of()))
                .isInstanceOf(NFeValidationException.class)
                .hasMessageContaining("valor_total inconsistente");
    }

    @Test
    void destinatarioSemCnpjRejeita() {
        var mapper = new NFeMapper(props(emitente(), defaults()));
        var emp = new EmpresaFiscal(7L, "Cliente", null, null, null, null, null);
        var d = dados(emp, endereco(), List.of(item("83111000", "5102")),
                new BigDecimal("100.00"), BigDecimal.ZERO, BigDecimal.ZERO);

        assertThatThrownBy(() -> mapper.montar(d, Map.of()))
                .isInstanceOf(NFeValidationException.class)
                .hasMessageContaining("cnpj");
    }

    @Test
    void emitenteIncompletoRejeita() {
        var emitente = new Emitente("11222333000181", "HWeld", null, null, null,
                null, null, "Guarulhos", "SP", "07000000", 1, null);
        var mapper = new NFeMapper(props(emitente, defaults()));
        var d = dados(empresa(), endereco(), List.of(item("83111000", "5102")),
                new BigDecimal("100.00"), BigDecimal.ZERO, BigDecimal.ZERO);

        assertThatThrownBy(() -> mapper.montar(d, Map.of()))
                .isInstanceOf(NFeValidationException.class)
                .hasMessageContaining("emitente");
    }

    @Test
    void ncmInvalidoRejeitaComOrientacaoDeCadastro() {
        var mapper = new NFeMapper(props(emitente(), defaults()));
        var d = dados(empresa(), endereco(), List.of(item("1234", "5102")),
                new BigDecimal("100.00"), BigDecimal.ZERO, BigDecimal.ZERO);

        assertThatThrownBy(() -> mapper.montar(d, Map.of()))
                .isInstanceOf(NFeValidationException.class)
                .hasMessageContaining("codigo_ncm");
    }

    @Test
    void snapshotDaNfSobrescreveNaturezaECfop() {
        var mapper = new NFeMapper(props(emitente(), defaults()));
        var pedido = new PedidoFiscal(42L, "PV-0042", "faturado",
                new BigDecimal("100"), BigDecimal.ZERO, BigDecimal.ZERO,
                new BigDecimal("100"));
        var nf = new NotaFiscalResumo(9L, "12", "1", "Devolução", "5202", "rascunho");
        var d = new DadosFiscaisPedido(pedido, List.of(item("83111000", null)),
                empresa(), endereco(), nf);

        var body = mapper.montar(d, Map.of());
        assertThat(body.get("natureza_operacao")).isEqualTo("Devolução");
        @SuppressWarnings("unchecked")
        var items = (List<Map<String, Object>>) body.get("items");
        // item sem cfop cai no cfop da NF (5202), não no default (5102)
        assertThat(items.get(0).get("cfop")).isEqualTo("5202");
    }
}
