package com.hweld.operations.logistics.infrastructure.melhorenvio;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.hweld.operations.logistics.application.ShippingProvider.CotacaoServico;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

/**
 * Normalização do objeto-mapa oficial `{serviceId: {…}}` → `CotacaoServico`:
 * `custom_price`/`custom_delivery_time` preferidos (taxas da conta), erro por
 * serviço isolado e ordenação disponíveis-primeiro/menor-preço.
 */
class MelhorEnvioProviderTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final MelhorEnvioProvider provider = new MelhorEnvioProvider(null, null);

    @Test
    void normalizaRespostaOficialComCustomPrice() {
        var resposta = mapper.readTree("""
            {
              "2": {
                "id": 2, "name": "SEDEX",
                "price": "25.40", "custom_price": "22.10",
                "delivery_time": 3, "custom_delivery_time": 2,
                "company": {"id": 1, "name": "Correios"}
              },
              "1": {
                "id": 1, "name": "PAC",
                "price": "14.90", "custom_price": "13.50",
                "delivery_time": 9, "custom_delivery_time": 8,
                "company": {"id": 1, "name": "Correios"}
              }
            }
            """);

        List<CotacaoServico> out = provider.normalizar(resposta);

        assertEquals(2, out.size());
        assertEquals(1, out.get(0).serviceId()); // menor preço primeiro
        assertEquals(new BigDecimal("13.50"), out.get(0).preco()); // custom_price
        assertEquals(8, out.get(0).prazoDias()); // custom_delivery_time
        assertEquals("Correios", out.get(0).transportadora());
        assertNull(out.get(0).erro());
        assertEquals(new BigDecimal("22.10"), out.get(1).preco());
    }

    @Test
    void servicoComErroNaoQuebraCotacaoEVaiAoFinal() {
        var resposta = mapper.readTree("""
            {
              "3": {
                "id": 3, "name": "Jadlog Package",
                "error": "Não atende a região de destino",
                "company": {"id": 2, "name": "Jadlog"}
              },
              "1": {
                "id": 1, "name": "PAC",
                "custom_price": "10.00", "custom_delivery_time": 5,
                "company": {"id": 1, "name": "Correios"}
              }
            }
            """);

        List<CotacaoServico> out = provider.normalizar(resposta);

        assertEquals(2, out.size());
        assertEquals(1, out.get(0).serviceId()); // disponível primeiro
        assertNull(out.get(0).erro());
        assertEquals(3, out.get(1).serviceId());
        assertEquals("Não atende a região de destino", out.get(1).erro());
    }

    @Test
    void montaBodyOficialPorProdutos() {
        var input = new com.hweld.operations.logistics.application
                .ShippingProvider.CotacaoInput(
                        "01310100", "20230010",
                        List.of(new com.hweld.operations.logistics.application
                                .ShippingProvider.ProdutoCotacao(
                                        "SKU-1", 20, 10, 30,
                                        new BigDecimal("1.5"), new BigDecimal("120.00"), 2)),
                        "1,2");

        var body = provider.montarBody(input);

        assertEquals("01310100",
                ((java.util.Map<?, ?>) body.get("from")).get("postal_code"));
        assertEquals("20230010",
                ((java.util.Map<?, ?>) body.get("to")).get("postal_code"));
        assertEquals("1,2", body.get("services"));
        var produtos = (List<?>) body.get("products");
        assertEquals(1, produtos.size());
        var p = (java.util.Map<?, ?>) produtos.get(0);
        assertEquals("SKU-1", p.get("id"));
        assertEquals(20, p.get("width"));
        assertEquals(new BigDecimal("1.5"), p.get("weight"));
        assertEquals(2, p.get("quantity"));
    }

    @Test
    void respostaVaziaOuInesperadaRetornaListaVazia() {
        assertTrue(provider.normalizar(mapper.createObjectNode()).isEmpty());
        assertTrue(provider.normalizar(null).isEmpty());
        assertTrue(provider.normalizar(mapper.readTree("[1,2]")).isEmpty());
    }
}
