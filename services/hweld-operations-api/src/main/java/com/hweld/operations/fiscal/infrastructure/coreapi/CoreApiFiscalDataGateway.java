package com.hweld.operations.fiscal.infrastructure.coreapi;

import com.hweld.operations.fiscal.application.FiscalDataGateway;
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
 * `GET {CORE_API}/api/v1/internal/pedidos/{id}/dados-fiscais` — canal
 * service-to-service autenticado por `X-Service-Token`. O core-api monta o
 * conjunto (pedido + itens com campos fiscais resolvidos + empresa +
 * endereço de faturamento): o payload NF-e nasce de dados autoritatídicos,
 * nunca de dados digitados no frontend.
 */
@Component
public class CoreApiFiscalDataGateway implements FiscalDataGateway {

    private static final Logger log = LoggerFactory.getLogger(CoreApiFiscalDataGateway.class);

    private final RestClient client;
    private final ObjectMapper mapper;
    private final SecurityProperties security;

    public CoreApiFiscalDataGateway(@Qualifier("coreApiClient") RestClient client,
            ObjectMapper mapper, SecurityProperties security) {
        this.client = client;
        this.mapper = mapper;
        this.security = security;
    }

    @Override
    public DadosFiscaisPedido buscar(long pedidoId, Long notaFiscalId) {
        String uri = "/api/v1/internal/pedidos/" + pedidoId + "/dados-fiscais"
                + (notaFiscalId != null ? "?nota_fiscal_id=" + notaFiscalId : "");
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
                throw ApiException.naoEncontrado("dados fiscais do pedido não encontrados");
            }
            log.error("core-api dados-fiscais pedido {} → {}: {}",
                    pedidoId, status, e.getResponseBodyAsString());
            throw ApiException.provedorIndisponivel("core-api indisponível");
        } catch (Exception e) {
            if (e instanceof ApiException ae) throw ae;
            log.error("core-api dados-fiscais pedido {} falhou: {}", pedidoId, e.getMessage());
            throw ApiException.provedorIndisponivel("core-api indisponível");
        }

        try {
            return parse(body);
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            log.error("core-api dados-fiscais pedido {} resposta inesperada: {}",
                    pedidoId, e.getMessage());
            throw ApiException.provedorIndisponivel("resposta inesperada do core-api");
        }
    }

    private DadosFiscaisPedido parse(JsonNode body) {
        JsonNode p = body.required("pedido");
        var pedido = new PedidoFiscal(
                p.required("id").asLong(),
                textOr(p, "numero", ""),
                textOr(p, "status", ""),
                decimal(p.get("subtotal")),
                decimal(p.get("desconto")),
                decimal(p.get("frete")),
                decimal(p.get("total")));

        var itens = new ArrayList<ItemFiscal>();
        for (JsonNode i : body.withArray("itens")) {
            itens.add(new ItemFiscal(
                    textOr(i, "codigo", ""),
                    textOr(i, "descricao", ""),
                    decimal(i.get("quantidade")),
                    decimal(i.get("valor_unitario")),
                    decimal(i.get("desconto")),
                    decimal(i.get("valor_total")),
                    textOr(i, "ncm", null),
                    textOr(i, "cfop", null),
                    textOr(i, "unidade", null)));
        }

        JsonNode e = body.required("empresa");
        var empresa = new EmpresaFiscal(
                e.required("id").asLong(),
                textOr(e, "razao_social", ""),
                textOr(e, "nome_fantasia", null),
                textOr(e, "cnpj", null),
                textOr(e, "inscricao_estadual", null),
                textOr(e, "telefone", null),
                textOr(e, "email", null));

        EnderecoFiscal endereco = null;
        JsonNode end = body.get("endereco_faturamento");
        if (end != null && end.isObject()) {
            endereco = new EnderecoFiscal(
                    textOr(end, "logradouro", null),
                    textOr(end, "numero", null),
                    textOr(end, "complemento", null),
                    textOr(end, "bairro", null),
                    textOr(end, "cidade", ""),
                    textOr(end, "uf", ""),
                    textOr(end, "cep", ""));
        }

        NotaFiscalResumo nota = null;
        JsonNode nf = body.get("nota_fiscal");
        if (nf != null && nf.isObject()) {
            nota = new NotaFiscalResumo(
                    nf.required("id").asLong(),
                    textOr(nf, "numero", null),
                    textOr(nf, "serie", null),
                    textOr(nf, "natureza_operacao", null),
                    textOr(nf, "cfop", null),
                    textOr(nf, "status", ""));
        }

        return new DadosFiscaisPedido(pedido, itens, empresa, endereco, nota);
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
}
