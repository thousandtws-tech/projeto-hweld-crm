package com.hweld.operations.fiscal.infrastructure.spedy;

import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.shared.infrastructure.security.CredentialCipher;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
 * Client HTTP da API Spedy v1 (docs.spedy.com.br).
 *
 * Autenticação: `X-Api-Key` — chave estática por empresa, gerenciada pelo
 * cliente em `integration_settings` (`spedy-fiscal`): `base_url` define o
 * ambiente (`https://api.spedy.com.br` produção | `https://sandbox-api...`
 * sandbox) e `api_key_enc` a chave cifrada. Credenciais são resolvidas por
 * chamada — trocar a chave no painel não exige reinício.
 *
 * Escopo implementado (contrato oficial): NF-e em `/v1/product-invoices`
 * (emissão assíncrona, consulta por id ou `integrationId`, cancelamento
 * `DELETE` com `reason`, CC-e, check-status, XML/PDF), gestão de webhooks em
 * `/v1/webhooks` e segredo de assinatura em `/v1/webhooks/secret`.
 *
 * Retry: o client só repete leituras (GET) — emissão/cancelamento não são
 * reenviados após falha de transporte; a reconciliação consulta pela
 * `integrationId` antes de qualquer reenvio (idempotência oficial).
 *
 * NUNCA loga a chave, headers ou payload fiscal completo.
 */
@Component
public class SpedyClient {

    private static final Logger log = LoggerFactory.getLogger(SpedyClient.class);
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

    // ── NF-e: emissão / consulta / cancelamento / CC-e ───────────────────────

    /**
     * `POST /v1/product-invoices` — cria e enfileira a nota para a SEFAZ.
     * A resposta `2xx` confirma aceite, não autorização (status vem por
     * webhook ou consulta). `integrationId` no payload é a chave de
     * idempotência oficial.
     */
    public JsonNode emitirNfe(Map<String, Object> payload) {
        return exchange("POST", API_PREFIX + "/product-invoices", payload, true);
    }

    /** `GET /v1/product-invoices/{id}` — consulta pelo id da nota na Spedy. */
    public JsonNode consultarNfe(String invoiceId) {
        return exchange("GET", API_PREFIX + "/product-invoices/" + invoiceId, null, false);
    }

    /**
     * `GET /v1/product-invoices?integrationId={ref}&pageSize=1` — reconciliação
     * pós-falha: localiza a nota pela nossa referência quando o id remoto ainda
     * não foi gravado.
     */
    public JsonNode consultarNfePorIntegrationId(String integrationId) {
        return exchange("GET",
                API_PREFIX + "/product-invoices?integrationId=" + integrationId + "&pageSize=1",
                null, false);
    }

    /** `DELETE /v1/product-invoices/{id}` — `{reason}` 15–255 chars (SEFAZ). */
    public JsonNode cancelarNfe(String invoiceId, String motivo) {
        return exchange("DELETE", API_PREFIX + "/product-invoices/" + invoiceId,
                Map.of("reason", motivo), true);
    }

    /** `POST /v1/product-invoices/{id}/corrections` — `{letter}` 15–1000 chars. */
    public JsonNode cartaCorrecaoNfe(String invoiceId, String correcao) {
        return exchange("POST", API_PREFIX + "/product-invoices/" + invoiceId + "/corrections",
                Map.of("letter", correcao), true);
    }

    /**
     * `POST /v1/product-invoices/{id}/check-status` — força reconciliação com
     * a SEFAZ (equivalente ao "reenvio de status" dos outros provedores).
     */
    public JsonNode checkStatusNfe(String invoiceId) {
        return exchange("POST", API_PREFIX + "/product-invoices/" + invoiceId + "/check-status",
                null, true);
    }

    // ── Artefatos ────────────────────────────────────────────────────────────

    /** `GET /v1/product-invoices/{id}/xml` — XML autorizado da nota. */
    public byte[] baixarXmlNfe(String invoiceId) {
        return exchangeBytes(API_PREFIX + "/product-invoices/" + invoiceId + "/xml");
    }

    /** `GET /v1/product-invoices/{id}/pdf` — DANFE da nota. */
    public byte[] baixarPdfNfe(String invoiceId) {
        return exchangeBytes(API_PREFIX + "/product-invoices/" + invoiceId + "/pdf");
    }

    // ── Conta / webhooks ─────────────────────────────────────────────────────

    /**
     * `GET /v1/companies?page=1&pageSize=1` — teste de conexão + identificação
     * da empresa titular das credenciais.
     */
    public JsonNode listarEmpresas() {
        return exchange("GET", API_PREFIX + "/companies?page=1&pageSize=1", null, false);
    }

    /** `GET /v1/webhooks/secret` — segredo `whsec_` de assinatura da conta. */
    public JsonNode segredoWebhook() {
        return exchange("GET", API_PREFIX + "/webhooks/secret", null, false);
    }

    /** `GET /v1/webhooks?page=1&pageSize=100` — webhooks registrados na conta. */
    public JsonNode listarWebhooks() {
        return exchange("GET", API_PREFIX + "/webhooks?page=1&pageSize=100", null, false);
    }

    /** `POST /v1/webhooks` — `{event, url}`; um webhook por evento. */
    public JsonNode criarWebhook(String event, String url) {
        return exchange("POST", API_PREFIX + "/webhooks",
                Map.of("event", event, "url", url), false);
    }

    // ── Núcleo HTTP ──────────────────────────────────────────────────────────

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

    /**
     * RestClient por chamada — credenciais dinâmicas da `integration_settings`
     * (rotação de chave no painel vale imediatamente). Fail-fast quando
     * base URL ou chave estão ausentes.
     */
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
