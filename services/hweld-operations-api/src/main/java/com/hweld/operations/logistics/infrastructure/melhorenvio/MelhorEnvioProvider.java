package com.hweld.operations.logistics.infrastructure.melhorenvio;

import com.hweld.operations.logistics.application.ShippingProvider;
import com.hweld.operations.logistics.infrastructure.ShippingProviderException;
import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

@Component
public class MelhorEnvioProvider implements ShippingProvider {

    public static final String NAME = "melhorenvio";

    private final MelhorEnvioClient client;
    private final IntegrationSettingsRepository settings;

    public MelhorEnvioProvider(MelhorEnvioClient client,
            IntegrationSettingsRepository settings) {
        this.client = client;
        this.settings = settings;
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public boolean configured() {
        return settings.findById(IntegrationSettings.MELHOR_ENVIO_FRETE)
                .map(IntegrationSettings::credenciaisMelhorEnvioCompletas)
                .orElse(false);
    }

    @Override
    public List<CotacaoServico> cotar(CotacaoInput input) {
        JsonNode resposta = client.calcular(montarBody(input));
        return normalizar(resposta);
    }

    Map<String, Object> montarBody(CotacaoInput input) {
        var body = new LinkedHashMap<String, Object>();
        body.put("from", Map.of("postal_code", input.cepOrigem()));
        body.put("to", Map.of("postal_code", input.cepDestino()));
        if (input.servicos() != null && !input.servicos().isBlank()) {
            body.put("services", input.servicos().trim());
        }
        var produtos = new ArrayList<Map<String, Object>>();
        for (ProdutoCotacao p : input.produtos()) {
            var prod = new LinkedHashMap<String, Object>();
            prod.put("id", p.id());
            prod.put("width", p.width());
            prod.put("height", p.height());
            prod.put("length", p.length());
            prod.put("weight", p.weight());
            prod.put("insurance_value", p.insuranceValue());
            prod.put("quantity", p.quantity());
            produtos.add(prod);
        }
        body.put("products", produtos);
        return body;
    }

    List<CotacaoServico> normalizar(JsonNode resposta) {
        var out = new ArrayList<CotacaoServico>();
        if (resposta == null || !resposta.isObject())
            return out;
        resposta.properties().forEach(e -> {
            JsonNode s = e.getValue();
            if (!s.isObject())
                return;
            int serviceId;
            try {
                serviceId = s.hasNonNull("id") ? s.path("id").asInt()
                        : Integer.parseInt(e.getKey());
            } catch (NumberFormatException ignored) {
                return;
            }
            String erro = s.hasNonNull("error") ? s.path("error").asString() : null;
            JsonNode company = s.path("company");
            out.add(new CotacaoServico(
                    serviceId,
                    s.path("name").asString(null),
                    company.isObject() ? company.path("name").asString(null) : null,
                    preco(s),
                    prazo(s),
                    erro));
        });
        out.sort((a, b) -> {
            boolean ea = a.erro() != null, eb = b.erro() != null;
            if (ea != eb)
                return ea ? 1 : -1;
            if (a.preco() != null && b.preco() != null)
                return a.preco().compareTo(b.preco());
            return Integer.compare(a.serviceId(), b.serviceId());
        });
        return out;
    }

    private static BigDecimal preco(JsonNode s) {
        JsonNode v = s.hasNonNull("custom_price") ? s.get("custom_price") : s.get("price");
        return numero(v);
    }

    private static Integer prazo(JsonNode s) {
        JsonNode v = s.hasNonNull("custom_delivery_time")
                ? s.get("custom_delivery_time")
                : s.get("delivery_time");
        return v != null && v.isNumber() ? v.asInt() : null;
    }

    private static BigDecimal numero(JsonNode v) {
        if (v == null || v.isNull())
            return null;
        if (v.isNumber())
            return v.decimalValue();
        try {
            return new BigDecimal(v.asString().replace(",", "."));
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    static ShippingProviderException erro(String msg) {
        return MelhorEnvioException.provedor(msg, 0);
    }
}
