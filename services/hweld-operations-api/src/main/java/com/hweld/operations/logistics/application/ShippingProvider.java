package com.hweld.operations.logistics.application;

import java.math.BigDecimal;
import java.util.List;

public interface ShippingProvider {

        String name();

        default boolean configured() {
                return true;
        }

        List<CotacaoServico> cotar(CotacaoInput input);

        record CotacaoInput(
                        String cepOrigem,
                        String cepDestino,
                        List<ProdutoCotacao> produtos,
                        String servicos) {
        }

        record ProdutoCotacao(
                        String id,
                        int width,
                        int height,
                        int length,
                        BigDecimal weight,
                        BigDecimal insuranceValue,
                        int quantity) {
        }

        record CotacaoServico(
                        int serviceId,
                        String nome,
                        String transportadora,
                        BigDecimal preco,
                        Integer prazoDias,
                        String erro) {
        }
}
