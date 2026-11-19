package com.hweld.operations.logistics.infrastructure;

import com.hweld.operations.logistics.application.ShippingProvider;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Stub de desenvolvimento — cotações sintéticas determinísticas (nunca chama
 * rede). Ativo quando `hweld.logistics.provider=stub` ou `auto` sem
 * credenciais Melhor Envio configuradas. Peso/dimensões alimentam o preço
 * para a tela de teste ter valores plausíveis.
 */
@Component
public class StubShippingProvider implements ShippingProvider {

    public static final String NAME = "stub";

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public List<CotacaoServico> cotar(CotacaoInput input) {
        BigDecimal peso = input.produtos().stream()
                .map(p -> p.weight().multiply(BigDecimal.valueOf(p.quantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal base = BigDecimal.valueOf(12)
                .add(peso.multiply(BigDecimal.valueOf(8)))
                .setScale(2, RoundingMode.HALF_UP);
        return List.of(
                new CotacaoServico(1, "PAC", "Correios (stub)",
                        base.multiply(new BigDecimal("1.0")).setScale(2, RoundingMode.HALF_UP),
                        8, null),
                new CotacaoServico(2, "SEDEX", "Correios (stub)",
                        base.multiply(new BigDecimal("1.6")).setScale(2, RoundingMode.HALF_UP),
                        4, null));
    }
}
