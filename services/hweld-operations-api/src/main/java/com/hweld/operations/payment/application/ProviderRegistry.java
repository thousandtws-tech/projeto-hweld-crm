package com.hweld.operations.payment.application;

import com.hweld.operations.shared.interfaces.error.ApiException;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/** Registro de providers por nome — `stub` sempre presente; PSPs reais entram por credencial. */
@Component
public class ProviderRegistry {

    private final Map<String, PaymentProvider> providers;
    private final PaymentProperties props;

    public ProviderRegistry(List<PaymentProvider> all, PaymentProperties props) {
        this.providers = all.stream().collect(Collectors.toMap(PaymentProvider::name, Function.identity()));
        this.props = props;
    }

    public PaymentProvider get(String name) {
        PaymentProvider p = providers.get(name);
        if (p == null) {
            throw ApiException.validacao("provider de pagamento desconhecido: " + name);
        }
        return p;
    }

    /**
     * `auto` resolve para o PSP real credenciado pelo cliente (PagBank) ou,
     * na ausência de credenciais, para o stub — mesmo padrão fiscal/logística.
     */
    public PaymentProvider defaultProvider() {
        String configured = props.defaultProvider();
        if ("auto".equalsIgnoreCase(configured)) {
            return providers.values().stream()
                    .filter(p -> !"stub".equals(p.name()) && p.configured())
                    .findFirst()
                    .orElseGet(() -> get("stub"));
        }
        return get(configured);
    }
}
