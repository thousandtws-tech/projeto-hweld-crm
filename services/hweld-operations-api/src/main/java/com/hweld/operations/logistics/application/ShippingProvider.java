package com.hweld.operations.logistics.application;

import java.math.BigDecimal;
import java.util.List;

/**
 * Port do provedor logístico — contrato universal de cotação de fretes
 * (Melhor Envio hoje; demais carriers por adapter próprio). Nenhum tipo da
 * API do provedor vaza: entrada/saída são tipos neutros.
 */
public interface ShippingProvider {

    String name();

    /** Credenciais mínimas configuradas (token + ambiente + CEP origem). */
    default boolean configured() {
        return true;
    }

    /** Cotar frete — devolve serviços disponíveis (com e sem erro por serviço). */
    List<CotacaoServico> cotar(CotacaoInput input);

    record CotacaoInput(
            String cepOrigem,
            String cepDestino,
            List<ProdutoCotacao> produtos,
            /** CSV de ids de serviço permitidos — null = todos os da conta. */
            String servicos) {}

    record ProdutoCotacao(
            String id,
            /** Largura em cm. */
            int width,
            /** Altura em cm. */
            int height,
            /** Comprimento em cm. */
            int length,
            /** Peso em kg. */
            BigDecimal weight,
            /** Valor unitário segurado (BRL). */
            BigDecimal insuranceValue,
            int quantity) {}

    record CotacaoServico(
            int serviceId,
            String nome,
            String transportadora,
            BigDecimal preco,
            Integer prazoDias,
            /** Erro por serviço (CEP fora de área, dimensões excedidas…). */
            String erro) {}
}
