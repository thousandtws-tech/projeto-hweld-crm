package com.hweld.operations.payment.infrastructure.pagbank;

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

@Component
public class PagBankClient {

    public static final String URL_PRODUCAO = "https://api.pagseguro.com";
    public static final String URL_SANDBOX = "https://sandbox.api.pagseguro.com";

    private final IntegrationSettingsRepository settings;
    private final CredentialCipher cipher;
    private final ObjectMapper mapper;
    private final PagBankProperties props;

    public PagBankClient(IntegrationSettingsRepository settings, CredentialCipher cipher,
            ObjectMapper mapper, PagBankProperties props) {
        this.settings = settings;
        this.cipher = cipher;
        this.mapper = mapper;
        this.props = props;
    }

    /** `POST /orders` — cria pedido com cobrança (`charges[]`). */
    public JsonNode criarPedido(Map<String, Object> body) {
        return exchange("POST", "/orders", body, true);
    }

    /** `GET /orders/{orderId}` — consulta pedido (reconciliação). */
    public JsonNode consultarPedido(String orderId) {
        return exchange("GET", "/orders/" + orderId, null, false);
    }

    /** `GET /charges/{chargeId}` — consulta cobrança (estado real do pagamento). */
    public JsonNode consultarCobranca(String chargeId) {
        return exchange("GET", "/charges/" + chargeId, null, false);
    }

    /**
     * `POST /charges/{chargeId}/cancel` — cancela pré-autorização ou estorna
     * um pagamento capturado. `body` pode ser `null` (cancelamento total) ou
     * `{amount:{value: centavos}}` para estorno parcial.
     */
    public JsonNode cancelarCobranca(String chargeId, Map<String, Object> body) {
        return exchange("POST", "/charges/" + chargeId + "/cancel", body, true);
    }

    /** `GET /public-keys` — leitura autenticada segura para "Testar conexão". */
    public JsonNode chavesPublicas() {
        return exchange("GET", "/public-keys", null, false);
    }

    public JsonNode criarCheckout(Map<String, Object> body) {
        return exchange("POST", "/checkouts", body, true);
    }

    public JsonNode consultarCheckout(String checkoutId) {
        return exchange("GET", "/checkouts/" + checkoutId, null, false);
    }

    public JsonNode inativarCheckout(String checkoutId) {
        return exchange("POST", "/checkouts/" + checkoutId + "/inactivate", null, true);
    }

    private JsonNode exchange(String method, String uri, Object body, boolean escrita) {
        try {
            var spec = client().method(org.springframework.http.HttpMethod.valueOf(method))
                    .uri(uri)
                    .header("Accept", MediaType.APPLICATION_JSON_VALUE);
            if (body != null) {
                spec = spec.contentType(MediaType.APPLICATION_JSON).body(body);
            }
            String raw = spec.retrieve().body(String.class);
            if (raw == null || raw.isBlank())
                return mapper.createObjectNode();
            return mapper.readTree(raw);
        } catch (RestClientResponseException e) {
            throw mapear(e);
        } catch (PagBankException e) {
            throw e;
        } catch (RestClientException e) {
            throw escrita
                    ? PagBankException.inconclusivo(
                            "resposta perdida no PagBank — reconciliar antes de reenviar: "
                                    + e.getMessage())
                    : PagBankException.transporte("falha de rede no PagBank: " + e.getMessage());
        } catch (Exception e) {
            throw PagBankException.transporte(
                    "resposta inesperada do PagBank: " + e.getMessage());
        }
    }

    private PagBankException mapear(RestClientResponseException e) {
        HttpStatusCode status = e.getStatusCode();
        String raw = e.getResponseBodyAsString();
        String mensagem = "HTTP " + status.value();
        try {
            JsonNode body = mapper.readTree(raw);
            JsonNode erros = body.path("error_messages");
            if (erros.isArray() && !erros.isEmpty()) {
                StringBuilder sb = new StringBuilder();
                erros.forEach(err -> {
                    String desc = err.path("description").asString("");
                    String code = err.path("code").asString("");
                    if (!desc.isBlank()) {
                        if (sb.length() > 0)
                            sb.append("; ");
                        sb.append(desc);
                        if (!code.isBlank())
                            sb.append(" (").append(code).append(")");
                    }
                });
                if (sb.length() > 0)
                    mensagem = sb.toString();
            }
            if (mensagem.startsWith("HTTP") && body.hasNonNull("message")) {
                mensagem = body.path("message").asString();
            }
        } catch (Exception ignored) {
            if (raw != null && !raw.isBlank()) {
                mensagem = raw.length() > 200 ? raw.substring(0, 200) : raw;
            }
        }

        return switch (status.value()) {
            case 401, 403 -> PagBankException.autenticacao(
                    "token recusado pelo PagBank (" + status.value()
                            + ") — verifique o token e o ambiente (sandbox ≠ produção)",
                    status.value());
            case 404 -> PagBankException.naoEncontrado(
                    mensagem.isBlank() ? "recurso não encontrado no PagBank" : mensagem);
            case 429 -> PagBankException.rateLimit("rate limit PagBank excedido",
                    retryAfterMs(e));
            default -> status.is5xxServerError()
                    ? PagBankException.provedor(mensagem, status.value())
                    : PagBankException.validacao(mensagem, status.value());
        };
    }

    private long retryAfterMs(RestClientResponseException e) {
        try {
            String h = e.getResponseHeaders() != null
                    ? e.getResponseHeaders().getFirst("Retry-After")
                    : null;
            return h != null ? Long.parseLong(h.trim()) * 1000L : 0;
        } catch (Exception ignored) {
            return 0;
        }
    }

    private RestClient client() {
        IntegrationSettings cfg = settings.findById(IntegrationSettings.PAGBANK_PAGAMENTOS)
                .orElseThrow(() -> PagBankException.autenticacao(
                        "integração PagBank não configurada — salve o token no painel", 0));
        String baseUrl = cfg.getBaseUrl();
        String token = cfg.getApiKeyEnc() != null ? cipher.decrypt(cfg.getApiKeyEnc()) : null;
        if (baseUrl == null || baseUrl.isBlank()) {
            throw PagBankException.autenticacao(
                    "ambiente PagBank não configurado — escolha sandbox ou produção", 0);
        }
        if (token == null || token.isBlank()) {
            throw PagBankException.autenticacao(
                    "token PagBank ausente — configure no painel", 0);
        }
        java.net.http.HttpClient jdk = java.net.http.HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(Math.min(props.timeoutMs(), 5000)))
                .build();
        var factory = new JdkClientHttpRequestFactory(jdk);
        factory.setReadTimeout(Duration.ofMillis(props.timeoutMs()));
        String base = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        return RestClient.builder()
                .baseUrl(base)
                .requestFactory(factory)
                .defaultHeader("Authorization", "Bearer " + token)
                .build();
    }
}
