package com.hweld.operations.notification.infrastructure.infobip;

import com.hweld.operations.notification.application.SmsProvider;
import com.hweld.operations.notification.application.SmsSendException;
import com.hweld.operations.notification.application.SmsSendException.Kind;
import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.shared.infrastructure.security.CredentialCipher;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Adapter Infobip SMS API — `POST {baseUrl}/sms/3/messages` com
 * `Authorization: App {API_KEY}` (doc: infobip.com/docs/api/sms-api).
 * Credenciais vêm de `integration_settings` (gestão do cliente no painel,
 * cifradas via `CredentialCipher`) — resolvidas por chamada, nunca
 * cacheadas em claro além do RestClient da configuração corrente.
 */
@Component
public class InfobipSmsProvider implements SmsProvider {

    private static final Logger log = LoggerFactory.getLogger(InfobipSmsProvider.class);

    private final IntegrationSettingsRepository settings;
    private final CredentialCipher cipher;
    private final InfobipProperties props;
    private final ObjectMapper mapper;

    /** Cliente da configuração corrente — reconstruído só se ela mudar. */
    private volatile String cachedFingerprint;
    private volatile RestClient cachedClient;

    public InfobipSmsProvider(IntegrationSettingsRepository settings,
            CredentialCipher cipher, InfobipProperties props, ObjectMapper mapper) {
        this.settings = settings;
        this.cipher = cipher;
        this.props = props;
        this.mapper = mapper;
    }

    @Override
    public String name() {
        return "infobip";
    }

    /** Credenciais resolvidas do banco — ou null se incompletas. */
    public record Resolved(String baseUrl, String apiKey, String sender) {}

    public Resolved resolve() {
        IntegrationSettings cfg = settings.findById(IntegrationSettings.INFOBIP_SMS)
                .orElse(null);
        if (cfg == null || !cfg.credenciaisCompletas()) return null;
        return new Resolved(cfg.getBaseUrl(), cipher.decrypt(cfg.getApiKeyEnc()), cfg.getSender());
    }

    public boolean configured() {
        IntegrationSettings cfg = settings.findById(IntegrationSettings.INFOBIP_SMS)
                .orElse(null);
        return cfg != null && cfg.credenciaisCompletas();
    }

    @Override
    public SmsReceipt send(String to, String text) {
        Resolved r = resolve();
        if (r == null) {
            throw new SmsSendException(Kind.INVALID_CREDENTIALS,
                    "Infobip sem credenciais — configure em Integrações");
        }
        if (!r.baseUrl().startsWith("https://")) {
            throw new SmsSendException(Kind.INVALID_CREDENTIALS,
                    "base URL Infobip deve ser HTTPS — recusado: " + r.baseUrl());
        }
        var body = Map.of("messages", List.of(Map.of(
                "sender", r.sender(),
                "destinations", List.of(Map.of("to", to)),
                "text", text)));
        try {
            String raw = client(r).post().uri("/sms/3/messages")
                    .body(body)
                    .retrieve()
                    .body(String.class);
            JsonNode resp = mapper.readTree(raw);
            JsonNode msg = resp.path("messages").isArray() && !resp.path("messages").isEmpty()
                    ? resp.path("messages").get(0) : resp;
            JsonNode status = msg.path("status");
            int groupId = status.path("groupId").asInt(-1);
            String statusName = status.path("name").asString("");
            if (groupId == 5 || groupId == 2) {
                throw new SmsSendException(Kind.PERMANENT,
                        "Infobip rejeitou: " + statusName);
            }
            return new SmsReceipt(
                    msg.path("messageId").asString(null),
                    resp.path("bulkId").asString(null),
                    msg.hasNonNull("smsCount") ? msg.path("smsCount").asInt() : null);
        } catch (SmsSendException e) {
            throw e;
        } catch (RestClientResponseException e) {
            throw mapHttpError(e);
        } catch (Exception e) {
            throw new SmsSendException(Kind.TRANSIENT, "infobip: " + e.getMessage(), null, e);
        }
    }

    /**
     * Teste de conexão read-only — `GET /account/1/balance` (doc. Infobip).
     * Valida credencial + permissão SEM enviar SMS (nunca gera custo).
     */
    @Override
    public ConnectionTest testConnection() {
        Resolved r = resolve();
        if (r == null) {
            return new ConnectionTest(false, "credenciais ausentes — salve a configuração");
        }
        if (!r.baseUrl().startsWith("https://")) {
            return new ConnectionTest(false, "base URL deve ser HTTPS");
        }
        try {
            String raw = client(r).get().uri("/account/1/balance")
                    .retrieve()
                    .body(String.class);
            JsonNode resp = mapper.readTree(raw);
            String balance = resp.path("balance").asString("");
            String currency = resp.path("currency").asString("");
            return new ConnectionTest(true,
                    "conta acessível — saldo " + balance + " " + currency);
        } catch (RestClientResponseException e) {
            return new ConnectionTest(false, describe(e.getStatusCode().value()));
        } catch (Exception e) {
            return new ConnectionTest(false, "falha de conexão: " + e.getMessage());
        }
    }

    /** RestClient por credencial resolvida — troca ao salvar nova config. */
    private RestClient client(Resolved r) {
        String fp = r.baseUrl() + "|" + Integer.toHexString(r.apiKey().hashCode());
        RestClient c = cachedClient;
        if (c == null || !fp.equals(cachedFingerprint)) {
            synchronized (this) {
                java.net.http.HttpClient jdk = java.net.http.HttpClient.newBuilder()
                        .connectTimeout(Duration.ofMillis(Math.min(props.timeoutMs(), 3000)))
                        .build();
                var factory = new JdkClientHttpRequestFactory(jdk);
                factory.setReadTimeout(Duration.ofMillis(props.timeoutMs()));
                c = RestClient.builder()
                        .baseUrl(r.baseUrl())
                        .requestFactory(factory)
                        .defaultHeader("Authorization", "App " + r.apiKey())
                        .build();
                cachedClient = c;
                cachedFingerprint = fp;
            }
        }
        return c;
    }

    private SmsSendException mapHttpError(RestClientResponseException e) {
        int status = e.getStatusCode().value();
        Long retryAfter = parseRetryAfter(e.getResponseHeaders() != null
                ? e.getResponseHeaders().getFirst("Retry-After") : null);
        return switch (status) {
            case 401 -> new SmsSendException(Kind.INVALID_CREDENTIALS,
                    "API key inválida (HTTP 401)");
            case 403 -> new SmsSendException(Kind.NO_PERMISSION,
                    "sem permissão de SMS nesta conta (HTTP 403)");
            case 429 -> new SmsSendException(Kind.RATE_LIMIT,
                    "rate limit Infobip (HTTP 429)", retryAfter);
            case 400, 404, 422 -> new SmsSendException(Kind.PERMANENT,
                    "requisição rejeitada (HTTP " + status + "): "
                            + excerpt(e.getResponseBodyAsString()));
            default -> new SmsSendException(status >= 500 ? Kind.TRANSIENT : Kind.PERMANENT,
                    "Infobip HTTP " + status + ": " + excerpt(e.getResponseBodyAsString()));
        };
    }

    private static Long parseRetryAfter(String header) {
        if (header == null || header.isBlank()) return null;
        try {
            return Long.parseLong(header.trim()) * 1000L;
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static String describe(int status) {
        return switch (status) {
            case 401 -> "API key inválida";
            case 403 -> "sem permissão nesta conta";
            case 429 -> "rate limit — tente em instantes";
            default -> "Infobip HTTP " + status;
        };
    }

    private static String excerpt(String body) {
        if (body == null) return "";
        return body.length() > 200 ? body.substring(0, 200) : body;
    }
}
