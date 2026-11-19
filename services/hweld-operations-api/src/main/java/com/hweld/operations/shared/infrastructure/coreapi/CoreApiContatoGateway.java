package com.hweld.operations.shared.infrastructure.coreapi;

import com.hweld.operations.shared.infrastructure.security.SecurityProperties;
import com.hweld.operations.shared.infrastructure.security.ServiceTokenFilter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * `GET {CORE_API}/api/v1/internal/contatos/{id}/notificacao` — canal
 * service-to-service (`X-Service-Token`) espelhando `CoreApiFiscalDataGateway`.
 * Falha de rede/5xx → null (o handler decide se registra pendência).
 */
@Component
public class CoreApiContatoGateway implements ContatoGateway {

    private static final Logger log = LoggerFactory.getLogger(CoreApiContatoGateway.class);

    private final RestClient client;
    private final ObjectMapper mapper;
    private final SecurityProperties security;

    public CoreApiContatoGateway(@Qualifier("coreApiClient") RestClient client,
            ObjectMapper mapper, SecurityProperties security) {
        this.client = client;
        this.mapper = mapper;
        this.security = security;
    }

    @Override
    public ContatoNotificacao getContato(long contatoId) {
        try {
            String raw = client.get()
                    .uri("/api/v1/internal/contatos/" + contatoId + "/notificacao")
                    .header(ServiceTokenFilter.HEADER, security.internalServiceToken())
                    .retrieve()
                    .body(String.class);
            JsonNode body = mapper.readTree(raw);
            return new ContatoNotificacao(contatoId,
                    textOr(body, "email"), textOr(body, "telefone"));
        } catch (RestClientResponseException e) {
            if (e.getStatusCode().value() == 404) return null;
            log.warn("core-api contato {} → {}: {}", contatoId,
                    e.getStatusCode(), e.getMessage());
            return null;
        } catch (Exception e) {
            log.warn("core-api contato {} falhou: {}", contatoId, e.getMessage());
            return null;
        }
    }

    private static String textOr(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v != null && !v.isNull() && !v.asString().isBlank() ? v.asString() : null;
    }
}
