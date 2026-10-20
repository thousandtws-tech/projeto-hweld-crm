package com.hweld.operations.fiscal.infrastructure.focusnfe;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
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
 * Client HTTP da Focus NFe API v2 (doc.focusnfe.com.br/reference).
 *
 * Autenticação: HTTP Basic — username = token da empresa, password = vazio
 * (`Authorization: Basic Base64(token + ":")`).
 *
 * Semântica oficial: emissão NF-e devolve 201 (autorização síncrona) ou 202
 * (fila — `processando_autorizacao`); NFS-e sempre assíncrona (201 com
 * status `processando_autorizacao`). Consulta por referência, cancelamento
 * com justificativa 15–255 caracteres, gatilhos em `/v2/hooks`.
 *
 * Retry: o client só repete leituras (GET) — emissão/cancelamento não são
 * reenviados após falha de transporte; a reconciliação consulta a referência
 * antes de qualquer reenvio (idempotência por `ref`).
 *
 * NUNCA loga token, Authorization ou payload fiscal completo.
 */
@Component
public class FocusNFeClient {

    private static final Logger log = LoggerFactory.getLogger(FocusNFeClient.class);
    private static final String API_PREFIX = "/v2";

    private final FocusNFeProperties props;
    private final ObjectMapper mapper;
    private volatile RestClient client;

    public FocusNFeClient(FocusNFeProperties props, ObjectMapper mapper) {
        this.props = props;
        this.mapper = mapper;
    }

    // ── Emissão / consulta / cancelamento ────────────────────────────────────

    /**
     * `POST /v2/{doc}?ref={ref}` — devolve o corpo da resposta (201/202).
     * Erros 4xx/5xx viram `FocusNFeException` tipada; falha de transporte
     * marca `inconclusivo=true` (o provedor pode ter recebido).
     */
    public JsonNode emitir(String docPath, String ref, Map<String, Object> payload) {
        String uri = API_PREFIX + "/" + docPath + "?ref=" + urlEncode(ref);
        return exchange("POST", uri, payload, true);
    }

    /** `GET /v2/{doc}/{ref}` — 404 vira `FocusNFeException.naoEncontrado`. */
    public JsonNode consultar(String docPath, String ref) {
        String uri = API_PREFIX + "/" + docPath + "/" + urlEncode(ref);
        return exchange("GET", uri, null, false);
    }

    /**
     * `DELETE /v2/{doc}/{ref}` com `{justificativa}` (15–255 chars — a
     * validação de tamanho acontece no provider antes da chamada).
     */
    public JsonNode cancelar(String docPath, String ref, String justificativa) {
        String uri = API_PREFIX + "/" + docPath + "/" + urlEncode(ref);
        return exchange("DELETE", uri, Map.of("justificativa", justificativa), true);
    }

    /** `POST /v2/nfe/{ref}/carta_correcao` — correção 15–1000 caracteres. */
    public JsonNode cartaCorrecao(String ref, String correcao) {
        String uri = API_PREFIX + "/nfe/" + urlEncode(ref) + "/carta_correcao";
        return exchange("POST", uri, Map.of("correcao", correcao), true);
    }

    // ── Hooks (gatilhos) ─────────────────────────────────────────────────────

    /**
     * `POST /v2/hooks` — registra gatilho. `authorizationHeader` define o
     * nome do header que a Focus envia com o segredo `authorization`.
     */
    public JsonNode criarHook(String event, String url, String cnpj,
            String authorization, String authorizationHeader) {
        var body = new java.util.HashMap<String, Object>();
        body.put("event", event);
        body.put("url", url);
        if (cnpj != null && !cnpj.isBlank()) body.put("cnpj", cnpj);
        if (authorization != null && !authorization.isBlank()) {
            body.put("authorization", authorization);
            if (authorizationHeader != null && !authorizationHeader.isBlank()) {
                body.put("authorization_header", authorizationHeader);
            }
        }
        return exchange("POST", API_PREFIX + "/hooks", body, false);
    }

    /** `GET /v2/hooks` — lista gatilhos registrados no token. */
    public JsonNode listarHooks() {
        return exchange("GET", API_PREFIX + "/hooks", null, false);
    }

    /** `DELETE /v2/hooks/{id}` — remove gatilho. */
    public JsonNode excluirHook(String hookId) {
        return exchange("DELETE", API_PREFIX + "/hooks/" + urlEncode(hookId), null, false);
    }

    /** `POST /v2/{doc}/{ref}/hook` — solicita reenvio das notificações. */
    public JsonNode reenviarHook(String docPath, String ref) {
        String uri = API_PREFIX + "/" + docPath + "/" + urlEncode(ref) + "/hook";
        return exchange("POST", uri, null, false);
    }

    // ── Artefatos ────────────────────────────────────────────────────────────

    /**
     * Download de artefato pelo caminho retornado na consulta
     * (`caminho_xml_nota_fiscal`, `caminho_danfe`, `caminho_xml_cancelamento`).
     * Devolve `null` quando o caminho é vazio.
     */
    public byte[] downloadArtefato(String caminho) {
        if (caminho == null || caminho.isBlank()) return null;
        try {
            return client().get().uri(caminho)
                    .retrieve()
                    .body(byte[].class);
        } catch (RestClientResponseException e) {
            throw mapear(e, caminho);
        } catch (RestClientException e) {
            throw FocusNFeException.transporte(
                    "falha de rede ao baixar artefato: " + e.getMessage(), false);
        }
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
        } catch (FocusNFeException e) {
            throw e;
        } catch (RestClientException e) {
            throw FocusNFeException.transporte(
                    "falha de rede na Focus NFe: " + e.getMessage(), efeitoColateral);
        } catch (Exception e) {
            throw FocusNFeException.transporte(
                    "resposta inesperada da Focus NFe: " + e.getMessage(), efeitoColateral);
        }
    }

    private FocusNFeException mapear(RestClientResponseException e, String uri) {
        HttpStatusCode status = e.getStatusCode();
        String raw = e.getResponseBodyAsString();
        String codigo = "erro_http";
        String mensagem = "HTTP " + status.value();
        List<Map<String, Object>> erros = List.of();
        try {
            JsonNode body = mapper.readTree(raw);
            if (body.hasNonNull("codigo")) codigo = body.path("codigo").asText();
            if (body.hasNonNull("mensagem")) mensagem = body.path("mensagem").asText();
            if (body.isArray()) erros = lerErros(body);
            else if (body.has("erros") && body.path("erros").isArray()) {
                erros = lerErros(body.path("erros"));
            }
        } catch (Exception ignored) {
            if (raw != null && !raw.isBlank()) {
                mensagem = raw.length() > 200 ? raw.substring(0, 200) : raw;
            }
        }

        return switch (status.value()) {
            case 401, 403 -> FocusNFeException.autenticacao(
                    "credencial Focus NFe recusada (" + status.value() + ")", status.value());
            case 404 -> FocusNFeException.naoEncontrado(
                    mensagem.isBlank() ? "referência não encontrada no provedor" : mensagem);
            case 429 -> FocusNFeException.rateLimit("rate limit Focus NFe excedido",
                    retryAfterMs(e));
            default -> status.is5xxServerError()
                    ? FocusNFeException.provedor(mensagem, status.value())
                    : FocusNFeException.validacao(codigo, mensagem, status.value(), erros);
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

    private List<Map<String, Object>> lerErros(JsonNode arr) {
        var lista = new ArrayList<Map<String, Object>>();
        arr.forEach(n -> {
            if (n.isObject()) {
                lista.add(mapper.convertValue(n, Map.class));
            }
        });
        return lista;
    }

    private RestClient client() {
        var c = client;
        if (c == null) {
            synchronized (this) {
                c = client;
                if (c == null) {
                    // token() faz fail-fast: produção sem habilitação ou
                    // sem token impede a construção do client.
                    String basic = basic(props.token());
                    java.net.http.HttpClient jdk = java.net.http.HttpClient.newBuilder()
                            .connectTimeout(Duration.ofMillis(Math.min(props.timeoutMs(), 5000)))
                            .build();
                    var factory = new JdkClientHttpRequestFactory(jdk);
                    factory.setReadTimeout(Duration.ofMillis(props.timeoutMs()));
                    c = RestClient.builder()
                            .baseUrl(props.baseUrl())
                            .requestFactory(factory)
                            .defaultHeader("Authorization", basic)
                            .build();
                    client = c;
                }
            }
        }
        return c;
    }

    /** `Authorization: Basic Base64(token + ":")` — senha vazia, contrato oficial. */
    static String basic(String token) {
        return "Basic " + Base64.getEncoder()
                .encodeToString((token + ":").getBytes(StandardCharsets.UTF_8));
    }

    private static String urlEncode(String v) {
        return java.net.URLEncoder.encode(v, StandardCharsets.UTF_8);
    }
}
