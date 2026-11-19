package com.hweld.operations.logistics.infrastructure.melhorenvio;

import com.hweld.operations.logistics.infrastructure.LogisticsProperties;
import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.shared.infrastructure.security.CredentialCipher;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
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
 * Client HTTP da API Melhor Envio v2 (docs.melhorenvio.com.br).
 *
 * Autenticação: `Authorization: Bearer {access_token}` — token gerado pelo
 * cliente no aplicativo do painel Melhor Envio, gerenciado em
 * `integration_settings` (`melhorenvio-frete`): `base_url` define o
 * ambiente (`https://melhorenvio.com.br` produção |
 * `https://sandbox.melhorenvio.com.br` sandbox) e `api_key_enc` o token
 * cifrado. Credenciais resolvidas por chamada — trocar o token no painel
 * não exige reinício. `User-Agent` é obrigatório pelo contrato oficial.
 *
 * Escopo implementado (fase A): `GET /api/v2/me`, `GET /api/v2/me/balance`
 * e `POST /api/v2/me/shipment/calculate` (cotação por produtos).
 * Carrinho/compra/etiquetas/rastreio = fase B.
 *
 * NUNCA loga o token, headers ou endereços completos.
 */
@Component
public class MelhorEnvioClient {

    private static final String API_PREFIX = "/api/v2";

    public static final String URL_PRODUCAO = "https://melhorenvio.com.br";
    public static final String URL_SANDBOX = "https://sandbox.melhorenvio.com.br";

    private final IntegrationSettingsRepository settings;
    private final CredentialCipher cipher;
    private final ObjectMapper mapper;
    private final LogisticsProperties props;

    public MelhorEnvioClient(IntegrationSettingsRepository settings, CredentialCipher cipher,
            ObjectMapper mapper, LogisticsProperties props) {
        this.settings = settings;
        this.cipher = cipher;
        this.mapper = mapper;
        this.props = props;
    }

    /** Dados da conta autenticada — `GET /api/v2/me` (id, nome, e-mail). */
    public JsonNode me() {
        return exchange("GET", "/me", null);
    }

    /** Saldo da carteira — `GET /api/v2/me/balance` → `{balance}`. */
    public JsonNode saldo() {
        return exchange("GET", "/me/balance", null);
    }

    /**
     * Cotação de fretes — `POST /api/v2/me/shipment/calculate`.
     * Body: `{from:{postal_code}, to:{postal_code}, products:[…], services?}`.
     * Resposta: objeto-mapa `{serviceId: {…}}` — um frete por requisição.
     */
    public JsonNode calcular(Map<String, Object> body) {
        return exchange("POST", "/me/shipment/calculate", body);
    }

    private JsonNode exchange(String method, String uri, Object body) {
        try {
            var spec = client().method(org.springframework.http.HttpMethod.valueOf(method))
                    .uri(API_PREFIX + uri)
                    .header("Accept", MediaType.APPLICATION_JSON_VALUE);
            if (body != null) {
                spec = spec.contentType(MediaType.APPLICATION_JSON).body(body);
            }
            String raw = spec.retrieve().body(String.class);
            if (raw == null || raw.isBlank()) return mapper.createObjectNode();
            return mapper.readTree(raw);
        } catch (RestClientResponseException e) {
            throw mapear(e);
        } catch (MelhorEnvioException e) {
            throw e;
        } catch (RestClientException e) {
            throw MelhorEnvioException.transporte(
                    "falha de rede no Melhor Envio: " + e.getMessage());
        } catch (Exception e) {
            throw MelhorEnvioException.transporte(
                    "resposta inesperada do Melhor Envio: " + e.getMessage());
        }
    }

    private MelhorEnvioException mapear(RestClientResponseException e) {
        HttpStatusCode status = e.getStatusCode();
        String raw = e.getResponseBodyAsString();
        String codigo = "erro_http";
        String mensagem = "HTTP " + status.value();
        List<Map<String, Object>> erros = List.of();
        try {
            JsonNode body = mapper.readTree(raw);
            if (body.hasNonNull("error")) codigo = body.path("error").asString();
            else if (body.hasNonNull("code")) codigo = body.path("code").asString();
            if (body.hasNonNull("message")) mensagem = body.path("message").asString();
            else if (body.hasNonNull("mensagem")) mensagem = body.path("mensagem").asString();
            for (String campo : List.of("errors", "erros", "details")) {
                if (body.has(campo) && body.path(campo).isArray()) {
                    erros = lerErros(body.path(campo));
                    break;
                }
            }
        } catch (Exception ignored) {
            if (raw != null && !raw.isBlank()) {
                mensagem = raw.length() > 200 ? raw.substring(0, 200) : raw;
            }
        }

        return switch (status.value()) {
            case 401, 403 -> MelhorEnvioException.autenticacao(
                    "token recusado pelo Melhor Envio (" + status.value()
                            + ") — verifique o token e o ambiente (sandbox ≠ produção)",
                    status.value());
            case 404 -> MelhorEnvioException.naoEncontrado(
                    mensagem.isBlank() ? "recurso não encontrado no Melhor Envio" : mensagem);
            case 429 -> MelhorEnvioException.rateLimit("rate limit Melhor Envio excedido",
                    retryAfterMs(e));
            default -> status.is5xxServerError()
                    ? MelhorEnvioException.provedor(mensagem, status.value())
                    : MelhorEnvioException.validacao(codigo, mensagem, status.value(), erros);
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

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> lerErros(JsonNode arr) {
        var lista = new ArrayList<Map<String, Object>>();
        arr.forEach(n -> {
            if (n.isObject()) lista.add(mapper.convertValue(n, Map.class));
        });
        return lista;
    }

    /**
     * RestClient por chamada — credenciais dinâmicas da `integration_settings`.
     * `User-Agent` fixo do aplicativo (exigido pelo Melhor Envio).
     */
    private RestClient client() {
        IntegrationSettings cfg = settings.findById(IntegrationSettings.MELHOR_ENVIO_FRETE)
                .orElseThrow(() -> MelhorEnvioException.autenticacao(
                        "integração Melhor Envio não configurada — salve o token no painel", 0));
        String baseUrl = cfg.getBaseUrl();
        String token = cfg.getApiKeyEnc() != null ? cipher.decrypt(cfg.getApiKeyEnc()) : null;
        if (baseUrl == null || baseUrl.isBlank()) {
            throw MelhorEnvioException.autenticacao(
                    "ambiente Melhor Envio não configurado — escolha sandbox ou produção", 0);
        }
        if (token == null || token.isBlank()) {
            throw MelhorEnvioException.autenticacao(
                    "token Melhor Envio ausente — configure no painel", 0);
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
                .defaultHeader("User-Agent", props.userAgent())
                .build();
    }
}
