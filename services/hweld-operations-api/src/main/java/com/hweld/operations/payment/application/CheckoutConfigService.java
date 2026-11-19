package com.hweld.operations.payment.application;

import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.payment.infrastructure.mercadopago.MercadoPagoProvider;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Config pública de checkout para a loja — o portal precisa saber QUAL PSP
 * cobra cartão hoje e, se for Mercado Pago, a Public Key para tokenizar o
 * cartão no navegador (SDK js/v2 + Bricks). Nada de segredo sai por aqui:
 * public key é publicável por desenho; o Access Token fica só no backend.
 */
@Service
public class CheckoutConfigService {

    private final ProviderRegistry providers;
    private final IntegrationSettingsRepository settings;

    public CheckoutConfigService(ProviderRegistry providers,
            IntegrationSettingsRepository settings) {
        this.providers = providers;
        this.settings = settings;
    }

    /**
     * `provedorCartao` = PSP default do momento (o portal não escolhe provider).
     * `publicKey`/`parcelasMax` só fazem sentido quando provedor = mercadopago —
     * demais PSPs expõem checkout hospedado (checkoutUrl) e a loja não usa
     * estes campos.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> config() {
        String provedor = providers.defaultProvider().name();
        Map<String, Object> out = new TreeMap<>();
        out.put("provedorCartao", "stub".equals(provedor) ? "" : provedor);
        if (MercadoPagoProvider.NAME.equals(provedor)) {
            Map<String, Object> cfg = settings
                    .findById(IntegrationSettings.MERCADOPAGO_PAGAMENTOS)
                    .map(IntegrationSettings::getConfig).orElse(Map.of());
            Object pk = cfg.get("public_key");
            out.put("publicKey", pk != null ? String.valueOf(pk) : "");
            Object pm = cfg.get("parcelas_max");
            out.put("parcelasMax", pm instanceof Number n ? n.intValue() : 12);
        }
        return out;
    }
}
