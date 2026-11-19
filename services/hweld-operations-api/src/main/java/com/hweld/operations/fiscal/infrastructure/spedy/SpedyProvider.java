package com.hweld.operations.fiscal.infrastructure.spedy;

import com.hweld.operations.fiscal.application.FiscalDataGateway;
import com.hweld.operations.fiscal.application.FiscalProvider;
import com.hweld.operations.fiscal.domain.FiscalDocument;
import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.shared.application.ObjectStorage;
import com.hweld.operations.shared.interfaces.error.ApiException;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Adapter `FiscalProvider` da API Spedy v1 (docs.spedy.com.br).
 *
 * Escopo desta versão: NF-e (modelo 55) via `/v1/product-invoices` — emissão
 * assíncrona idempotente por `integrationId` (nosso `documentId`), consulta,
 * cancelamento (`DELETE` + `reason`), carta de correção, check-status na
 * SEFAZ e download de XML/DANFE para o object storage. Credenciais
 * (`X-Api-Key` + ambiente) são gerenciadas pelo cliente na integração
 * `spedy-fiscal` — nunca por variável de ambiente.
 *
 * Mapeamento dos status oficiais (ciclo de vida da nota):
 *   authorized    → AUTHORIZED
 *   rejected      → REJECTED
 *   canceled      → CANCELLED
 *   enqueued,
 *   processing,
 *   inContingent  → PROCESSING (aguardando retorno SEFAZ)
 *   error         → ERROR
 * O status bruto é preservado em `providerStatus`/`statusDetail`.
 */
@Component
public class SpedyProvider implements FiscalProvider {

    private static final Logger log = LoggerFactory.getLogger(SpedyProvider.class);
    public static final String NAME = "spedy";

    private final SpedyClient client;
    private final SpedyNFeMapper mapper;
    private final FiscalDataGateway fiscalData;
    private final IntegrationSettingsRepository settings;
    private final ObjectStorage storage;
    private final ObjectMapper json;

    public SpedyProvider(SpedyClient client, SpedyNFeMapper mapper,
            FiscalDataGateway fiscalData, IntegrationSettingsRepository settings,
            ObjectStorage storage, ObjectMapper json) {
        this.client = client;
        this.mapper = mapper;
        this.fiscalData = fiscalData;
        this.settings = settings;
        this.storage = storage;
        this.json = json;
    }

    @Override
    public String name() {
        return NAME;
    }

    /** Ambiente derivado da `base_url` configurada — sandbox = homologação. */
    @Override
    public String environment() {
        return settings.findById(IntegrationSettings.SPEDY_FISCAL)
                .map(IntegrationSettings::getBaseUrl)
                .map(u -> u.contains("sandbox") ? "homologacao" : "producao")
                .orElse("homologacao");
    }

    /** Integração habilitada + `X-Api-Key` e ambiente presentes. */
    @Override
    public boolean configured() {
        return settings.findById(IntegrationSettings.SPEDY_FISCAL)
                .map(c -> c.isEnabled() && c.credenciaisSpedyCompletas())
                .orElse(false);
    }

    /** `integrationId` = nosso documentId — idempotência e reconciliação. */
    @Override
    public String providerRef(String documentId) {
        return documentId;
    }

    @Override
    public EmissionResult requestEmission(EmissionRequest req) {
        if (!"NFE".equals(req.docType())) {
            throw ApiException.validacao(
                    "SpedyProvider suporta NFE nesta versão — " + req.docType()
                            + " (NFC-e/NFS-e chegam na próxima fase da integração)");
        }
        if (settings.findById(IntegrationSettings.SPEDY_FISCAL)
                .map(IntegrationSettings::isEnvioPausado).orElse(false)) {
            throw ApiException.validacao("emissão Spedy pausada pelo administrador");
        }

        Long notaFiscalId = req.dados() != null && req.dados().get("nota_fiscal_id") instanceof Number n
                ? n.longValue() : null;
        var dados = fiscalData.buscar(req.pedidoId(), notaFiscalId);
        Map<String, Object> payload = mapper.montar(req.documentId(), dados, req.dados());

        JsonNode resp = client.emitirNfe(payload);
        log.info("spedy: emissão nfe integrationId={} → status={}", req.documentId(),
                resp.path("status").asString("?"));
        return toEmission(resp);
    }

    @Override
    public StatusResult getStatus(String externalId) {
        try {
            return toStatus(client.consultarNfe(externalId));
        } catch (SpedyException e) {
            if (e.httpStatus() != 404) throw e;
            // O externalId pode ser ainda o nosso documentId (crash pós-POST):
            // reconcilia pelo integrationId oficial antes de desistir.
            JsonNode lista = client.consultarNfePorIntegrationId(externalId);
            JsonNode primeiro = primeiroItem(lista);
            if (primeiro == null) throw e;
            return toStatus(primeiro);
        }
    }

    @Override
    public void cancel(String externalId, String motivo) {
        validarJustificativa(motivo);
        JsonNode resp = client.cancelarNfe(externalId, motivo.trim());
        // A Spedy devolve o objeto da nota; o cancelamento pode ser assíncrono —
        // webhook/reconciliação confirmam o `canceled`. Só falha com rejeição
        // explícita do provedor.
        String status = texto(resp, "status");
        if ("rejected".equals(status) || "error".equals(status)) {
            throw SpedyException.provedor(
                    "cancelamento rejeitado: " + primeiro(resp,
                            "processingDetail.message", "message"), 0);
        }
    }

    /** `POST /v1/product-invoices/{id}/corrections` — `letter` 15–1000 chars. */
    @Override
    public void cartaCorrecao(String externalId, String correcao) {
        if (correcao == null || correcao.trim().length() < 15 || correcao.trim().length() > 1000) {
            throw ApiException.validacao(
                    "carta de correção deve ter entre 15 e 1000 caracteres");
        }
        client.cartaCorrecaoNfe(externalId, correcao.trim());
    }

    /**
     * `POST /v1/product-invoices/{id}/check-status` — força a Spedy a
     * reconciliar com a SEFAZ (equivalente funcional ao reenvio de webhook).
     */
    @Override
    public void requestNotificationResend(String externalId) {
        client.checkStatusNfe(externalId);
    }

    /**
     * Converte o `data` do webhook Spedy — mesmo objeto retornado por
     * `GET /v1/product-invoices/{id}`.
     */
    public StatusResult parseWebhook(JsonNode data) {
        return toStatus(data);
    }

    /** Baixa XML/DANFE (`GET .../xml`, `.../pdf`) para `fiscal/{docId}.*`. */
    @Override
    public Map<String, String> fetchArtifacts(String externalId, String documentId) {
        var chaves = new HashMap<String, String>();
        baixar(externalId, documentId, "xml", "application/xml", chaves);
        baixar(externalId, documentId, "pdf", "application/pdf", chaves);
        return chaves;
    }

    private void baixar(String externalId, String documentId, String tipo, String mime,
            Map<String, String> chaves) {
        try {
            byte[] bytes = "xml".equals(tipo)
                    ? client.baixarXmlNfe(externalId) : client.baixarPdfNfe(externalId);
            if (bytes != null && bytes.length > 0) {
                String chave = "fiscal/" + documentId + "." + tipo;
                storage.salvar(chave, bytes, mime);
                chaves.put(tipo, chave);
            }
        } catch (Exception e) {
            log.warn("spedy: download {} da nota {} falhou: {}", tipo, externalId, e.getMessage());
        }
    }

    // ── Mapeamento de respostas oficiais ──────────────────────────────────────

    private EmissionResult toEmission(JsonNode n) {
        String providerStatus = texto(n, "status");
        FiscalDocument.Status interno = mapearStatus(providerStatus);
        String detail = primeiro(n, "processingDetail.message", "message", "statusDetail");
        String rejeicao = interno == FiscalDocument.Status.REJECTED ? detail : null;
        return new EmissionResult(
                texto(n, "id"),
                interno, providerStatus, detail,
                texto(n, "accessKey"),
                texto(n, "authorization.protocol"),
                texto(n, "number"), texto(n, "series"),
                null, null, rejeicao, rawOf(n));
    }

    private StatusResult toStatus(JsonNode n) {
        String providerStatus = texto(n, "status");
        FiscalDocument.Status interno = mapearStatus(providerStatus);
        String detail = primeiro(n, "processingDetail.message", "message", "statusDetail");
        String rejeicao = interno == FiscalDocument.Status.REJECTED ? detail : null;
        return new StatusResult(interno, providerStatus, detail,
                texto(n, "accessKey"),
                texto(n, "authorization.protocol"),
                texto(n, "number"), texto(n, "series"),
                null, null, rejeicao);
    }

    private static FiscalDocument.Status mapearStatus(String providerStatus) {
        if (providerStatus == null) return FiscalDocument.Status.PROCESSING;
        return switch (providerStatus) {
            case "authorized" -> FiscalDocument.Status.AUTHORIZED;
            case "canceled", "cancelled" -> FiscalDocument.Status.CANCELLED;
            case "rejected" -> FiscalDocument.Status.REJECTED;
            case "error" -> FiscalDocument.Status.ERROR;
            default -> FiscalDocument.Status.PROCESSING;
        };
    }

    /** Caminho com ponto: `authorization.protocol` → n.authorization.protocol. */
    private static String texto(JsonNode n, String caminho) {
        JsonNode atual = n;
        for (String parte : caminho.split("\\.")) {
            atual = atual != null ? atual.get(parte) : null;
            if (atual == null) return null;
        }
        return !atual.isNull() && !atual.asString().isBlank() ? atual.asString() : null;
    }

    private static String primeiro(JsonNode n, String... caminhos) {
        for (String c : caminhos) {
            String v = texto(n, c);
            if (v != null) return v;
        }
        return null;
    }

    /** Primeiro elemento de respostas de lista (`{data|items|content: [...]}` ou array). */
    private static JsonNode primeiroItem(JsonNode lista) {
        if (lista == null) return null;
        JsonNode arr = lista.isArray() ? lista
                : lista.has("data") && lista.path("data").isArray() ? lista.path("data")
                : lista.has("items") && lista.path("items").isArray() ? lista.path("items")
                : lista.has("content") && lista.path("content").isArray() ? lista.path("content")
                : null;
        return arr != null && !arr.isEmpty() ? arr.get(0) : null;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> rawOf(JsonNode n) {
        var mapa = new LinkedHashMap<String, Object>(json.convertValue(n, Map.class));
        mapa.remove("xml");
        mapa.remove("pdf");
        return mapa;
    }

    private static void validarJustificativa(String motivo) {
        String m = motivo == null ? "" : motivo.trim();
        if (m.length() < 15 || m.length() > 255) {
            throw ApiException.validacao(
                    "justificativa de cancelamento deve ter entre 15 e 255 caracteres");
        }
    }
}
