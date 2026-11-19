package com.hweld.operations.shared.infrastructure.coreapi;

import com.hweld.operations.shared.domain.Money;
import com.hweld.operations.shared.interfaces.error.ApiException;
import java.math.BigDecimal;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Leitura do pedido no core-api repassando o Bearer do chamador — o Rust
 * continua sendo a autoridade de posse/visibilidade (portal: 404 se o pedido
 * não for da empresa do contato; staff: visibilidade de backoffice).
 */
@Component
public class CoreApiOrderGateway implements OrderGateway {

    private static final Logger log = LoggerFactory.getLogger(CoreApiOrderGateway.class);

    private final RestClient client;
    private final ObjectMapper mapper;
    private final ContatoGateway contatos;

    public CoreApiOrderGateway(@Qualifier("coreApiClient") RestClient client,
            ObjectMapper mapper, ContatoGateway contatos) {
        this.client = client;
        this.mapper = mapper;
        this.contatos = contatos;
    }

    @Override
    public OrderInfo getOrder(long pedidoId, String callerJwt, boolean portalContext) {
        JsonNode body = getJson(portalContext ? "/api/v1/portal/pedidos/" + pedidoId
                : "/api/v1/pedidos/" + pedidoId, callerJwt);
        try {
            JsonNode pedido = portalContext ? body : body.path("pedido");
            long id = pedido.path("id").asLong();
            String numero = textOr(pedido, "numero", String.valueOf(pedidoId));
            String status = textOr(pedido, "status", "desconhecido");
            BigDecimal total = decimal(pedido.get("total"));

            Long contatoId = pedido.hasNonNull("contato_id") ? pedido.path("contato_id").asLong() : null;
            Long empresaId = pedido.hasNonNull("empresa_id") ? pedido.path("empresa_id").asLong() : null;
            String email = null;
            String telefone = null;

            if (portalContext) {
                // Resposta do portal não carrega empresa_id/contato_id — vêm do perfil.
                PortalProfile perfil = getPortalProfile(callerJwt);
                empresaId = perfil.empresaId();
                contatoId = perfil.contatoId();
                email = perfil.email();
                telefone = perfil.telefone();
            } else if (contatoId != null) {
                // Staff: pedido traz só contato_id — resolve via canal interno.
                var contato = contatos.getContato(contatoId);
                if (contato != null) {
                    email = contato.email();
                    telefone = contato.telefone();
                }
            }
            if (empresaId == null || empresaId <= 0) {
                throw ApiException.proibido("pedido sem empresa identificável");
            }
            return new OrderInfo(id, numero, status, empresaId, contatoId,
                    Money.of(total), email, telefone);
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            log.error("core-api: resposta de pedido {} inesperada: {}", pedidoId, e.getMessage());
            throw ApiException.provedorIndisponivel("resposta inesperada do core-api");
        }
    }

    @Override
    public PortalProfile getPortalProfile(String callerJwt) {
        JsonNode body = getJson("/api/v1/portal/me", callerJwt);
        JsonNode contato = body.path("contato");
        JsonNode empresa = body.path("empresa");
        long contatoId = contato.path("id").asLong();
        long empresaId = empresa.path("id").asLong();
        String email = contato.hasNonNull("email") ? contato.path("email").asString() : null;
        String nome = contato.hasNonNull("nome") ? contato.path("nome").asString() : null;
        String telefone = contato.hasNonNull("telefone") ? contato.path("telefone").asString() : null;
        return new PortalProfile(contatoId, empresaId, email, nome, telefone);
    }

    private JsonNode getJson(String path, String callerJwt) {
        try {
            String raw = client.get().uri(path)
                    .header("Authorization", "Bearer " + callerJwt)
                    .retrieve()
                    .body(String.class);
            return mapper.readTree(raw);
        } catch (RestClientResponseException e) {
            HttpStatusCode status = e.getStatusCode();
            if (status.value() == 404) {
                throw ApiException.naoEncontrado("pedido não encontrado");
            }
            if (status.value() == 401 || status.value() == 403) {
                throw ApiException.proibido("sem acesso ao pedido no core-api");
            }
            log.error("core-api {} → {}: {}", path, status, e.getResponseBodyAsString());
            throw ApiException.provedorIndisponivel("core-api indisponível");
        } catch (Exception e) {
            if (e instanceof ApiException ae) throw ae;
            log.error("core-api {} falhou: {}", path, e.getMessage());
            throw ApiException.provedorIndisponivel("core-api indisponível");
        }
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
