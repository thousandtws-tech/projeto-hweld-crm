package com.hweld.operations.notification.infrastructure.zapi;

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

@Component
public class ZapiWhatsAppProvider implements SmsProvider {

    private static final Logger log = LoggerFactory.getLogger(ZapiWhatsAppProvider.class);
    private static final String BASE = "https://api.z-api.io";

    private final IntegrationSettingsRepository settings;
    private final CredentialCipher cipher;
    private final ObjectMapper mapper;

    private volatile String cachedFingerprint;
    private volatile RestClient cachedClient;

    public ZapiWhatsAppProvider(IntegrationSettingsRepository settings,
            CredentialCipher cipher, ObjectMapper mapper) {
        this.settings = settings;
        this.cipher = cipher;
        this.mapper = mapper;
    }

    @Override
    public String name() {
        return "zapi";
    }

    public record Resolved(String instanceId, String instanceToken, String clientToken) {}

    public Resolved resolve() {
        IntegrationSettings cfg = settings.findById(IntegrationSettings.ZAPI_WHATSAPP).orElse(null);
        if (cfg == null || !cfg.credenciaisZapiCompletas()) return null;
        return new Resolved(cfg.getExternalId(),
                cipher.decrypt(cfg.getApiKeyEnc()),
                cipher.decrypt(cfg.getClientTokenEnc()));
    }

    public boolean configured() {
        return resolve() != null;
    }

    @Override
    public SmsReceipt send(String to, String text) {
        Resolved r = resolve();
        if (r == null) {
            throw new SmsSendException(Kind.INVALID_CREDENTIALS,
                    "Z-API sem credenciais — configure em Integrações");
        }
        String phone = to == null ? "" : to.replaceAll("\\D", "");
        var body = Map.of("phone", phone, "message", text == null ? "" : text);
        try {
            String raw = client(r).post().uri("/send-text")
                    .body(body)
                    .retrieve()
                    .body(String.class);
            JsonNode resp = mapper.readTree(raw);
            String zaapId = resp.path("zaapId").asString(null);
            String messageId = resp.path("messageId").asString(null);
            return new SmsReceipt(zaapId != null ? zaapId : messageId, null, null);
        } catch (SmsSendException e) {
            throw e;
        } catch (RestClientResponseException e) {
            throw mapHttpError(e);
        } catch (Exception e) {
            throw new SmsSendException(Kind.TRANSIENT, "zapi: " + e.getMessage(), null, e);
        }
    }

    public JsonNode status() {
        Resolved r = resolve();
        if (r == null) return null;
        String raw = client(r).get().uri("/status").retrieve().body(String.class);
        return mapper.readTree(raw);
    }

    @Override
    public ConnectionTest testConnection() {
        Resolved r = resolve();
        if (r == null) {
            return new ConnectionTest(false, "credenciais ausentes — salve a configuração");
        }
        try {
            JsonNode s = status();
            boolean connected = s.path("connected").asBoolean(false);
            boolean smartphone = s.path("smartphoneConnected").asBoolean(false);
            return connected && smartphone
                    ? new ConnectionTest(true, "instância conectada ao WhatsApp")
                    : new ConnectionTest(true,
                            "credenciais válidas — instância aguardando conexão (escaneie o QR)");
        } catch (RestClientResponseException e) {
            return new ConnectionTest(false, describe(e.getStatusCode().value()));
        } catch (Exception e) {
            return new ConnectionTest(false, "falha de conexão: " + e.getMessage());
        }
    }

    public JsonNode qrCode() {
        Resolved r = resolve();
        if (r == null) return null;
        String raw = client(r).get().uri("/qr-code/image").retrieve().body(String.class);
        return mapper.readTree(raw);
    }

    public void configureWebhooks(String callbackBase) {
        Resolved r = resolve();
        if (r == null || callbackBase == null || callbackBase.isBlank()) return;
        RestClient c = client(r);
        for (String hook : List.of("received", "delivery", "disconnected")) {
            try {
                c.put().uri("/update-webhook-" + hook)
                        .body(Map.of("value", callbackBase + "/" + hook))
                        .retrieve()
                        .toBodilessEntity();
            } catch (Exception e) {
                log.warn("zapi webhook {} não configurado: {}", hook, e.getMessage());
            }
        }
    }

    public void disconnect() {
        Resolved r = resolve();
        if (r == null) return;
        client(r).post().uri("/disconnect").retrieve().toBodilessEntity();
    }

    private RestClient client(Resolved r) {
        String fp = r.instanceId() + "|" + Integer.toHexString(r.instanceToken().hashCode())
                + "|" + Integer.toHexString(r.clientToken().hashCode());
        RestClient c = cachedClient;
        if (c == null || !fp.equals(cachedFingerprint)) {
            synchronized (this) {
                java.net.http.HttpClient jdk = java.net.http.HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(3))
                        .build();
                var factory = new JdkClientHttpRequestFactory(jdk);
                factory.setReadTimeout(Duration.ofSeconds(15));
                c = RestClient.builder()
                        .baseUrl(BASE + "/instances/" + r.instanceId() + "/token/" + r.instanceToken())
                        .requestFactory(factory)
                        .defaultHeader("Client-Token", r.clientToken())
                        .build();
                cachedClient = c;
                cachedFingerprint = fp;
            }
        }
        return c;
    }

    private SmsSendException mapHttpError(RestClientResponseException e) {
        int status = e.getStatusCode().value();
        return switch (status) {
            case 400 -> new SmsSendException(Kind.PERMANENT,
                    "requisição rejeitada (HTTP 400): " + excerpt(e.getResponseBodyAsString()));
            case 401, 403 -> new SmsSendException(Kind.INVALID_CREDENTIALS,
                    "credenciais Z-API inválidas (HTTP " + status + ")");
            case 429 -> new SmsSendException(Kind.RATE_LIMIT, "rate limit Z-API (HTTP 429)");
            case 404 -> new SmsSendException(Kind.PERMANENT,
                    "instância não encontrada (HTTP 404) — confira o instance ID");
            default -> new SmsSendException(status >= 500 ? Kind.TRANSIENT : Kind.PERMANENT,
                    "Z-API HTTP " + status + ": " + excerpt(e.getResponseBodyAsString()));
        };
    }

    private static String describe(int status) {
        return switch (status) {
            case 401, 403 -> "credenciais inválidas — confira token e Client-Token";
            case 404 -> "instância não encontrada — confira o instance ID";
            case 429 -> "rate limit — tente em instantes";
            default -> "Z-API HTTP " + status;
        };
    }

    private static String excerpt(String body) {
        if (body == null) return "";
        return body.length() > 200 ? body.substring(0, 200) : body;
    }
}
