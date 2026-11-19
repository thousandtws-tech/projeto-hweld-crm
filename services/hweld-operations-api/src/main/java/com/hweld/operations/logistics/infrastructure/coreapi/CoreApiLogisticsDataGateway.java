package com.hweld.operations.logistics.infrastructure.coreapi;

import com.hweld.operations.logistics.application.LogisticsDataGateway;
import com.hweld.operations.shared.infrastructure.security.SecurityProperties;
import com.hweld.operations.shared.infrastructure.security.ServiceTokenFilter;
import com.hweld.operations.shared.interfaces.error.ApiException;
import java.math.BigDecimal;
import java.util.ArrayList;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * `GET {CORE_API}/api/v1/internal/pedidos/{id}/dados-logisticos` — canal
 * service-to-service (`X-Service-Token`). O core-api monta itens com
 * peso/dimensões do cadastro do produto + CEP de entrega: a cotação nasce
 * de dados autoritatídicos, nunca do frontend.
 */
@Component
public class CoreApiLogisticsDataGateway implements LogisticsDataGateway {

    private static final Logger log = LoggerFactory.getLogger(CoreApiLogisticsDataGateway.class);

    private final RestClient client;
    private final ObjectMapper mapper;
    private final SecurityProperties security;

    public CoreApiLogisticsDataGateway(@Qualifier("coreApiClient") RestClient client,
            ObjectMapper mapper, SecurityProperties security) {
        this.client = client;
        this.mapper = mapper;
        this.security = security;
    }

    @Override
    public DadosLogisticosPedido buscar(long pedidoId) {
        String uri = "/api/v1/internal/pedidos/" + pedidoId + "/dados-logisticos";
        JsonNode body;
        try {
            String raw = client.get().uri(uri)
                    .header(ServiceTokenFilter.HEADER, security.internalServiceToken())
                    .retrieve()
                    .body(String.class);
            body = mapper.readTree(raw);
        } catch (RestClientResponseException e) {
            int status = e.getStatusCode().value();
            if (status == 404) {
                throw ApiException.naoEncontrado("dados logísticos do pedido não encontrados");
            }
            log.error("core-api dados-logisticos pedido {} → {}: {}",
                    pedidoId, status, e.getResponseBodyAsString());
            throw ApiException.provedorIndisponivel("core-api indisponível");
        } catch (Exception e) {
            if (e instanceof ApiException ae) throw ae;
            log.error("core-api dados-logisticos pedido {} falhou: {}", pedidoId, e.getMessage());
            throw ApiException.provedorIndisponivel("core-api indisponível");
        }

        try {
            return parse(body);
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            log.error("core-api dados-logisticos pedido {} resposta inesperada: {}",
                    pedidoId, e.getMessage());
            throw ApiException.provedorIndisponivel("resposta inesperada do core-api");
        }
    }

    private DadosLogisticosPedido parse(JsonNode body) {
        JsonNode p = body.required("pedido");
        var pedido = new PedidoLogistico(
                p.required("id").asLong(),
                textOr(p, "numero", ""),
                textOr(p, "status", ""),
                p.required("empresa_id").asLong());

        var itens = new ArrayList<ItemLogistico>();
        for (JsonNode i : body.withArray("itens")) {
            itens.add(new ItemLogistico(
                    textOr(i, "sku", ""),
                    textOr(i, "descricao", ""),
                    decimal(i.get("quantidade")),
                    decimal(i.get("valor_unitario")),
                    decimalNullable(i.get("peso_kg")),
                    decimalNullable(i.get("altura_cm")),
                    decimalNullable(i.get("largura_cm")),
                    decimalNullable(i.get("comprimento_cm"))));
        }

        String cep = null;
        JsonNode end = body.get("endereco_entrega");
        if (end != null && end.isObject() && end.hasNonNull("cep")) {
            cep = end.path("cep").asString().replaceAll("\\D", "");
            if (cep.length() != 8) cep = null;
        }
        return new DadosLogisticosPedido(pedido, itens, cep);
    }

    private static String textOr(JsonNode node, String field, String fallback) {
        JsonNode v = node.get(field);
        return v != null && !v.isNull() ? v.asString() : fallback;
    }

    private static BigDecimal decimal(JsonNode node) {
        if (node == null || node.isNull()) return BigDecimal.ZERO;
        if (node.isString()) return new BigDecimal(node.asString());
        return node.decimalValue();
    }

    private static BigDecimal decimalNullable(JsonNode node) {
        if (node == null || node.isNull()) return null;
        if (node.isString()) return new BigDecimal(node.asString());
        return node.decimalValue();
    }
}
