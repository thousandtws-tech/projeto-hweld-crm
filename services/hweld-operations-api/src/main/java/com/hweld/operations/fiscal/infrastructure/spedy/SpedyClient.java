package com.hweld.operations.fiscal.infrastructure.spedy;

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

@Component
public class SpedyClient {

    private static final String API_PREFIX = "/v1";
    private static final long TIMEOUT_MS = 30_000;

    public static final String URL_PRODUCAO = "https://api.spedy.com.br";
    public static final String URL_SANDBOX = "https://sandbox-api.spedy.com.br";

    private final IntegrationSettingsRepository settings;
    private final CredentialCipher cipher;
    private final ObjectMapper mapper;

    public SpedyClient(IntegrationSettingsRepository settings, CredentialCipher cipher,
            ObjectMapper mapper) {
        this.settings = settings;
        this.cipher = cipher;
        this.mapper = mapper;
    }

    public JsonNode emitirNfe(Map<String, Object> payload) {
        return exchange("POST", API_PREFIX + "/product-invoices", payload, true);
    }

    public JsonNode consultarNfe(String invoiceId) {
        return exchange("GET", API_PREFIX + "/product-invoices/" + invoiceId, null, false);
    }

    public JsonNode consultarNfePorIntegrationId(String integrationId) {
        return exchange("GET",
                API_PREFIX + "/product-invoices?integrationId=" + integrationId + "&pageSize=1",
                null, false);
    }

    public JsonNode cancelarNfe(String invoiceId, String motivo) {
        return exchange("DELETE", API_PREFIX + "/product-invoices/" + invoiceId,
                Map.of("reason", motivo), true);
    }

    public JsonNode cartaCorrecaoNfe(String invoiceId, String correcao) {
        return exchange("POST", API_PREFIX + "/product-invoices/" + invoiceId + "/corrections",
                Map.of("letter", correcao), true);
    }

    public JsonNode checkStatusNfe(String invoiceId) {
        return exchange("POST", API_PREFIX + "/product-invoices/" + invoiceId + "/check-status",
                null, true);
    }

    public byte[] baixarXmlNfe(String invoiceId) {
        return exchangeBytes(API_PREFIX + "/product-invoices/" + invoiceId + "/xml");
    }

    public byte[] baixarPdfNfe(String invoiceId) {
        return exchangeBytes(API_PREFIX + "/product-invoices/" + invoiceId + "/pdf");
    }

    public JsonNode listarEmpresas() {
        return exchange("GET", API_PREFIX + "/companies?page=1&pageSize=1", null, false);
    }

    public JsonNode segredoWebhook() {
        return exchange("GET", API_PREFIX + "/webhooks/secret", null, false);
    }

    public JsonNode listarWebhooks() {
        return exchange("GET", API_PREFIX + "/webhooks?page=1&pageSize=100", null, false);
    }

    public JsonNode criarWebhook(String event, String url) {
        return exchange("POST", API_PREFIX + "/webhooks",
                Map.of("event", event, "url", url), false);
    }

    private JsonNode exchange(String method, String uri, Map<String, Object> body,
            boolean efeitoColateral) {
        try {
            var spec = client().method(org.springframework.http.HttpMethod.valueOf(method))
                    .uri(uri)
                    .header("Accept", MediaType.APPLICATION_JSON_VALUE);
            if (body != null) {
                spec = spec.contentType(MediaType.APPLICATION_JSON).body(body);
            }
            String raw = spec.retrieve().body(String.class);
            if (raw == null || raw.isBlank()) return mapper.createObjectNode();
            return mapper.readTree(raw);
        } catch (RestClientResponseException e) {
            throw mapear(e, uri);
        } catch (SpedyException e) {
            throw e;
        } catch (RestClientException e) {
            throw SpedyException.transporte(
                    "falha de rede na Spedy: " + e.getMessage(), efeitoColateral);
        } catch (Exception e) {
            throw SpedyException.transporte(
                    "resposta inesperada da Spedy: " + e.getMessage(), efeitoColateral);
        }
    }

    private byte[] exchangeBytes(String uri) {
        try {
            return client().get().uri(uri).retrieve().body(byte[].class);
        } catch (RestClientResponseException e) {
            throw mapear(e, uri);
        } catch (RestClientException e) {
            throw SpedyException.transporte(
                    "falha de rede ao baixar artefato: " + e.getMessage(), false);
        }
    }

    private SpedyException mapear(RestClientResponseException e, String uri) {
        HttpStatusCode status = e.getStatusCode();
        String raw = e.getResponseBodyAsString();
        String codigo = "erro_http";
        String mensagem = "HTTP " + status.value();
        List<Map<String, Object>> erros = List.of();
        try {
            JsonNode body = mapper.readTree(raw);
            if (body.hasNonNull("code")) codigo = body.path("code").asString();
            else if (body.hasNonNull("codigo")) codigo = body.path("codigo").asString();
            else if (body.hasNonNull("error")) codigo = body.path("error").asString();
            if (body.hasNonNull("message")) mensagem = body.path("message").asString();
            else if (body.hasNonNull("mensagem")) mensagem = body.path("mensagem").asString();
            if (body.isArray()) erros = lerErros(body);
            else {
                for (String campo : List.of("errors", "erros", "details")) {
                    if (body.has(campo) && body.path(campo).isArray()) {
                        erros = lerErros(body.path(campo));
                        break;
                    }
                }
            }
        } catch (Exception ignored) {
            if (raw != null && !raw.isBlank()) {
                mensagem = raw.length() > 200 ? raw.substring(0, 200) : raw;
            }
        }

        return switch (status.value()) {
            case 401, 403 -> SpedyException.autenticacao(
                    "X-Api-Key recusada pela Spedy (" + status.value()
                            + ") — verifique a chave e o ambiente", status.value());
            case 404 -> SpedyException.naoEncontrado(
                    mensagem.isBlank() ? "recurso não encontrado na Spedy" : mensagem);
            case 429 -> SpedyException.rateLimit("rate limit Spedy excedido",
                    retryAfterMs(e));
            default -> status.is5xxServerError()
                    ? SpedyException.provedor(mensagem, status.value())
                    : SpedyException.validacao(codigo, mensagem, status.value(), erros);
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

    private RestClient client() {
        IntegrationSettings cfg = settings.findById(IntegrationSettings.SPEDY_FISCAL)
                .orElseThrow(() -> SpedyException.autenticacao(
                        "integração Spedy não configurada — salve a X-Api-Key no painel", 0));
        String baseUrl = cfg.getBaseUrl();
        String apiKey = cfg.getApiKeyEnc() != null ? cipher.decrypt(cfg.getApiKeyEnc()) : null;
        if (baseUrl == null || baseUrl.isBlank()) {
            throw SpedyException.autenticacao(
                    "ambiente Spedy não configurado — escolha sandbox ou produção", 0);
        }
        if (apiKey == null || apiKey.isBlank()) {
            throw SpedyException.autenticacao("X-Api-Key Spedy ausente — configure no painel", 0);
        }
        java.net.http.HttpClient jdk = java.net.http.HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(Math.min(TIMEOUT_MS, 5000)))
                .build();
        var factory = new JdkClientHttpRequestFactory(jdk);
        factory.setReadTimeout(Duration.ofMillis(TIMEOUT_MS));
        String base = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        return RestClient.builder()
                .baseUrl(base)
                .requestFactory(factory)
                .defaultHeader("X-Api-Key", apiKey)
                .build();
    }
}
