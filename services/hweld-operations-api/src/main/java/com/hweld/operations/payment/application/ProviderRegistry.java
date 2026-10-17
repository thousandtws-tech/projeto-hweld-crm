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

    public PaymentProvider defaultProvider() {
        return get(props.defaultProvider());
    }
}
