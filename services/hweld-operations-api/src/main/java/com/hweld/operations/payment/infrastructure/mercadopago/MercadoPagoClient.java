package com.hweld.operations.payment.infrastructure.mercadopago;

import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.shared.infrastructure.security.CredentialCipher;
import java.time.Duration;
import java.util.Map;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Client HTTP da API Mercado Pago (api.mercadopago.com — uma única base:
 * teste e produção separam-se pelo Access Token TEST-/APP_USR- e por
 * `config.ambiente` da integração, não por URL diferente).
 *
 * Autenticação: `Authorization: Bearer {access_token}` — token gerado pelo
 * cliente no painel MP (Suas integrações → Credenciais), gerenciado em
 * `integration_settings` (`mercadopago-pagamentos.api_key_enc`). Credencial
 * resolvida por chamada — trocar o token no painel não exige reinício.
 *
 * Idempotência: escritas enviam `X-Idempotency-Key` (obrigatório no MP) —
 * a chave da operação lógica viaja junto; retry da mesma operação reutiliza
 * a MESMA chave, payload diferente nunca a reutiliza.
 *
 * Escopo: `POST /v1/payments` (Pix), `GET /v1/payments/{id}` (estado real —
 * fonte de verdade do webhook), `PUT /v1/payments/{id}` (cancel),
 * `POST /v1/payments/{id}/refunds` (estorno total/parcial),
 * `POST /checkout/preferences` (cartão hospedado), `GET /users/me`
 * (teste de conexão).
 *
 * NUNCA loga token, headers ou payload de cobrança completo.
 */
@Component
public class MercadoPagoClient {

    public static final String BASE_URL = "https://api.mercadopago.com";

    private final IntegrationSettingsRepository settings;
    private final CredentialCipher cipher;
    private final ObjectMapper mapper;
    private final MercadoPagoProperties props;

    public MercadoPagoClient(IntegrationSettingsRepository settings, CredentialCipher cipher,
            ObjectMapper mapper, MercadoPagoProperties props) {
        this.settings = settings;
        this.cipher = cipher;
        this.mapper = mapper;
        this.props = props;
    }

    /** `POST /v1/payments` — pagamento direto (Pix: qr_code + base64). */
    public JsonNode criarPagamento(Map<String, Object> body, String idempotencyKey) {
        return exchange("POST", "/v1/payments", body, idempotencyKey, true);
    }

    /** `GET /v1/payments/{id}` — fonte de verdade do estado do pagamento. */
    public JsonNode consultarPagamento(String paymentId) {
        return exchange("GET", "/v1/payments/" + paymentId, null, null, false);
    }

    /** `PUT /v1/payments/{id}` `{status:"cancelled"}` — cancela pendente/autorizado. */
    public JsonNode cancelarPagamento(String paymentId) {
        return exchange("PUT", "/v1/payments/" + paymentId,
                Map.of("status", "cancelled"), null, true);
    }

    /**
     * `POST /v1/payments/{id}/refunds` — estorno total (body vazio) ou
     * parcial (`{amount: valor em reais}` — contrato MP usa decimal, NÃO centavos).
     */
    public JsonNode estornarPagamento(String paymentId, Map<String, Object> body,
            String idempotencyKey) {
        return exchange("POST", "/v1/payments/" + paymentId + "/refunds",
                body, idempotencyKey, true);
    }

    /** `POST /checkout/preferences` — Checkout Pro: cartão na página do MP. */
    public JsonNode criarPreferencia(Map<String, Object> body, String idempotencyKey) {
        return exchange("POST", "/checkout/preferences", body, idempotencyKey, true);
    }

    /** `GET /checkout/preferences/{id}` — consulta da preferência (reconciliação). */
    public JsonNode consultarPreferencia(String preferenceId) {
        return exchange("GET", "/checkout/preferences/" + preferenceId, null, null, false);
    }

    /**
     * `GET /v1/payments/search?external_reference=` — acha os pagamentos
     * reais gerados por uma preferência Checkout Pro (a preferência tem
     * `external_reference` = nossa idempotency key).
     */
    public JsonNode buscarPagamentosPorReferencia(String externalReference) {
        return exchange("GET", "/v1/payments/search?external_reference="
                + java.net.URLEncoder.encode(externalReference,
                        java.nio.charset.StandardCharsets.UTF_8),
                null, null, false);
    }

    /** `GET /users/me` — leitura autenticada segura para "Testar conexão". */
    public JsonNode usuario() {
        return exchange("GET", "/users/me", null, null, false);
    }

    private JsonNode exchange(String method, String uri, Object body,
            String idempotencyKey, boolean escrita) {
        try {
            var spec = client().method(org.springframework.http.HttpMethod.valueOf(method))
                    .uri(uri)
                    .header("Accept", MediaType.APPLICATION_JSON_VALUE);
            if (idempotencyKey != null && !idempotencyKey.isBlank()) {
                spec = spec.header("X-Idempotency-Key", idempotencyKey);
            }
            if (body != null) {
                spec = spec.contentType(MediaType.APPLICATION_JSON).body(body);
            }
            String raw = spec.retrieve().body(String.class);
            if (raw == null || raw.isBlank()) return mapper.createObjectNode();
            return mapper.readTree(raw);
        } catch (RestClientResponseException e) {
            throw mapear(e);
        } catch (MercadoPagoException e) {
            throw e;
        } catch (RestClientException e) {
            throw escrita
                    ? MercadoPagoException.inconclusivo(
                            "resposta perdida no Mercado Pago — reconciliar antes de reenviar: "
                                    + e.getMessage())
                    : MercadoPagoException.transporte("falha de rede no Mercado Pago: " + e.getMessage());
        } catch (Exception e) {
            throw MercadoPagoException.transporte(
                    "resposta inesperada do Mercado Pago: " + e.getMessage());
        }
    }

    private MercadoPagoException mapear(RestClientResponseException e) {
        HttpStatusCode status = e.getStatusCode();
        String raw = e.getResponseBodyAsString();
        String mensagem = "HTTP " + status.value();
        try {
            JsonNode body = mapper.readTree(raw);
            // Envelope oficial: {message, error, status, cause:[{code,description}]}
            JsonNode causas = body.path("cause");
            if (causas.isArray() && !causas.isEmpty()) {
                StringBuilder sb = new StringBuilder();
                causas.forEach(c -> {
                    String desc = c.path("description").asString("");
                    if (desc.isBlank()) desc = c.path("code").asString("");
                    if (!desc.isBlank()) {
                        if (sb.length() > 0) sb.append("; ");
                        sb.append(desc);
                    }
                });
                if (sb.length() > 0) mensagem = sb.toString();
            }
            if (mensagem.startsWith("HTTP") && body.hasNonNull("message")) {
                mensagem = body.path("message").asString();
            }
            // Mensagens crípticas (ex.: causa só com código "23") carregam o
            // corpo bruto truncado — sem isso o erro em produção é indiagnostável.
            if (mensagem.length() < 40 && raw != null && !raw.isBlank()) {
                mensagem = mensagem + " | body=" + (raw.length() > 400 ? raw.substring(0, 400) : raw);
            }
        } catch (Exception ignored) {
            if (raw != null && !raw.isBlank()) {
                mensagem = raw.length() > 200 ? raw.substring(0, 200) : raw;
            }
        }

        return switch (status.value()) {
            case 401, 403 -> MercadoPagoException.autenticacao(
                    "access token recusado pelo Mercado Pago (" + status.value()
                            + ") — verifique o token e o ambiente (TEST- ≠ APP_USR-)",
                    status.value());
            case 404 -> MercadoPagoException.naoEncontrado(
                    mensagem.isBlank() ? "recurso não encontrado no Mercado Pago" : mensagem);
            case 429 -> MercadoPagoException.rateLimit("rate limit Mercado Pago excedido",
                    retryAfterMs(e));
            default -> status.is5xxServerError()
                    ? MercadoPagoException.provedor(mensagem, status.value())
                    : MercadoPagoException.validacao(mensagem, status.value());
        };
    }

    private long retryAfterMs(RestClientResponseException e) {
        try {
            String h = e.getResponseHeaders() != null
                    ? e.getResponseHeaders().getFirst("Retry-After") : null;
            return h != null ? Long.parseLong(h.trim()) * 1000L : 0;
        } catch (Exception ignored) {
            return 0;
        }
    }

    /** RestClient por chamada — credenciais dinâmicas da `integration_settings`. */
    private RestClient client() {
        IntegrationSettings cfg = settings.findById(IntegrationSettings.MERCADOPAGO_PAGAMENTOS)
                .orElseThrow(() -> MercadoPagoException.autenticacao(
                        "integração Mercado Pago não configurada — salve o token no painel", 0));
        String token = cfg.getApiKeyEnc() != null ? cipher.decrypt(cfg.getApiKeyEnc()) : null;
        if (token == null || token.isBlank()) {
            throw MercadoPagoException.autenticacao(
                    "access token Mercado Pago ausente — configure no painel", 0);
        }
        java.net.http.HttpClient jdk = java.net.http.HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(Math.min(props.timeoutMs(), 5000)))
                .build();
        var factory = new JdkClientHttpRequestFactory(jdk);
        factory.setReadTimeout(Duration.ofMillis(props.timeoutMs()));
        String base = cfg.getBaseUrl() != null && !cfg.getBaseUrl().isBlank()
                ? cfg.getBaseUrl() : BASE_URL;
        return RestClient.builder()
                .baseUrl(base)
                .requestFactory(factory)
                .defaultHeader("Authorization", "Bearer " + token)
                .build();
    }
}
