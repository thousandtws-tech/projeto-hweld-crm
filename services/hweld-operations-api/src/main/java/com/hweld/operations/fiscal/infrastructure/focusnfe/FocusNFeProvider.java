package com.hweld.operations.fiscal.infrastructure.focusnfe;

import com.hweld.operations.fiscal.application.FiscalDataGateway;
import com.hweld.operations.fiscal.application.FiscalProvider;
import com.hweld.operations.fiscal.domain.FiscalDocument;
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
 * Adapter `FiscalProvider` da Focus NFe API v2.
 *
 * Escopo desta versão: NF-e (modelo 55) — emissão por `ref` determinística
 * (`hweld-{docId}`), consulta, cancelamento, carta de correção, reenvio de
 * webhook e download de XML/DANFE para o object storage. NFS-e está fora do
 * escopo: o contrato municipal exige dados que o core-api ainda não modela
 * (código do município emissor, alíquota ISS, item da lista de serviço) —
 * tentativa resulta em erro de validação explícito, nunca em payload
 * inventado.
 *
 * Mapeamento dos status oficiais (doc.focusnfe.com.br):
 *   autorizado               → AUTHORIZED
 *   processando_autorizacao  → PROCESSING
 *   erro_autorizacao         → REJECTED
 *   cancelado                → CANCELLED
 * O status bruto é preservado em `providerStatus`/`statusDetail`.
 */
@Component
public class FocusNFeProvider implements FiscalProvider {

    private static final Logger log = LoggerFactory.getLogger(FocusNFeProvider.class);
    public static final String NAME = "focusnfe";

    private final FocusNFeProperties props;
    private final FocusNFeClient client;
    private final FiscalDataGateway fiscalData;
    private final NFeMapper mapper;
    private final ObjectStorage storage;
    private final ObjectMapper json;

    public FocusNFeProvider(FocusNFeProperties props, FocusNFeClient client,
            FiscalDataGateway fiscalData, NFeMapper mapper,
            ObjectStorage storage, ObjectMapper json) {
        this.props = props;
        this.client = client;
        this.fiscalData = fiscalData;
        this.mapper = mapper;
        this.storage = storage;
        this.json = json;
    }

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public String environment() {
        return props.environment();
    }

    /**
     * `true` quando o token do ambiente ativo resolve sem exceção — usado
     * pela resolução `provider=auto`; token ausente ou produção bloqueada
     * fazem a seleção cair para o próximo adapter.
     */
    @Override
    public boolean configured() {
        try {
            props.token();
            return true;
        } catch (IllegalStateException e) {
            return false;
        }
    }

    /** `ref` determinística — idempotência e reconciliação no provedor. */
    public static String ref(String documentId) {
        return "hweld-" + documentId;
    }

    @Override
    public String providerRef(String documentId) {
        return ref(documentId);
    }

    @Override
    public EmissionResult requestEmission(EmissionRequest req) {
        // token() faz fail-fast: produção sem habilitação explícita ou sem
        // token não chega a chamar a API (o client resolve o token no 1º uso).
        props.token();

        if (!"NFE".equals(req.docType())) {
            throw ApiException.validacao(
                    "FocusNFeProvider suporta NFE nesta versão — " + req.docType()
                            + " exige dados municipais ainda não modelados no cadastro");
        }

        Long notaFiscalId = req.dados() != null && req.dados().get("nota_fiscal_id") instanceof Number n
                ? n.longValue() : null;
        var dados = fiscalData.buscar(req.pedidoId(), notaFiscalId);
        Map<String, Object> payload = mapper.montar(dados, req.dados());
        String ref = ref(req.documentId());

        JsonNode resp = client.emitir("nfe", ref, payload);
        log.info("focusnfe: emissão nfe ref={} → status={}", ref,
                resp.path("status").asString("?"));
        return toEmission(ref, resp);
    }

    @Override
    public StatusResult getStatus(String externalId) {
        return toStatus(client.consultar(docPath(externalId), externalId));
    }

    @Override
    public void cancel(String externalId, String motivo) {
        validarJustificativa(motivo);
        JsonNode resp = client.cancelar(docPath(externalId), externalId, motivo);
        String status = resp.path("status").asString("");
        if (!"cancelado".equals(status) && !"cancelamento_homologado".equals(status)) {
            throw FocusNFeException.provedor(
                    "cancelamento não confirmado: " + resp.path("mensagem_sefaz").asString(status), 0);
        }
    }

    /** `POST /nfe/{ref}/carta_correcao` — correção textual 15–1000 chars. */
    @Override
    public void cartaCorrecao(String ref, String correcao) {
        if (correcao == null || correcao.trim().length() < 15 || correcao.trim().length() > 1000) {
            throw ApiException.validacao(
                    "carta de correção deve ter entre 15 e 1000 caracteres");
        }
        client.cartaCorrecao(ref, correcao.trim());
    }

    @Override
    public void requestNotificationResend(String externalId) {
        client.reenviarHook(docPath(externalId), externalId);
    }

    /**
     * Converte o corpo do webhook Focus — a notificação carrega os mesmos
     * campos da consulta (`ref`, `status`, `chave_nfe`, `numero`, `serie`,
     * `status_sefaz`, `mensagem_sefaz`...).
     */
    public StatusResult parseWebhook(Map<String, Object> payload) {
        return toStatus(json.valueToTree(payload));
    }

    /**
     * Consulta o documento e baixa os artefatos publicados
     * (`caminho_xml_nota_fiscal`, `caminho_danfe`, `caminho_xml_cancelamento`)
     * para `fiscal/{docId}.{xml,pdf}` no object storage.
     */
    @Override
    public Map<String, String> fetchArtifacts(String externalId, String documentId) {
        JsonNode consulta = client.consultar(docPath(externalId), externalId);
        var chaves = new HashMap<String, String>();
        String xmlKey = "fiscal/" + documentId + ".xml";
        String pdfKey = "fiscal/" + documentId + ".pdf";
        baixar(consulta, "caminho_xml_nota_fiscal", xmlKey, "application/xml", chaves, "xml");
        baixar(consulta, "caminho_danfe", pdfKey, "application/pdf", chaves, "pdf");
        baixar(consulta, "caminho_xml_cancelamento", "fiscal/" + documentId + "-cancelamento.xml",
                "application/xml", chaves, "cancelamento_xml");
        return chaves;
    }

    private void baixar(JsonNode consulta, String campo, String chave, String mime,
            Map<String, String> chaves, String alias) {
        String caminho = consulta.path(campo).asString(null);
        if (caminho == null || caminho.isBlank()) return;
        try {
            byte[] bytes = client.downloadArtefato(caminho);
            if (bytes != null && bytes.length > 0) {
                storage.salvar(chave, bytes, mime);
                chaves.put(alias, chave);
            }
        } catch (Exception e) {
            // Artefato indisponível não derruba a reconciliação — a próxima
            // passagem tenta de novo; o caminho remoto fica no payload.
            log.warn("focusnfe: download {} falhou ({}): {}", campo, caminho, e.getMessage());
        }
    }

    // ── Mapeamento de respostas oficiais ──────────────────────────────────────

    private EmissionResult toEmission(String ref, JsonNode n) {
        String providerStatus = n.path("status").asString(null);
        FiscalDocument.Status interno = mapearStatus(providerStatus);
        String detail = primeiro(n, "mensagem_sefaz", "status_sefaz");
        String rejeicao = interno == FiscalDocument.Status.REJECTED
                ? rejeicao(n, detail) : null;
        return new EmissionResult(ref, interno, providerStatus, detail,
                texto(n, "chave_nfe"), texto(n, "protocolo"),
                texto(n, "numero"), texto(n, "serie"),
                null, // xmlUrl/pdfUrl ficam nulos até fetchArtifacts gravar as chaves
                null, rejeicao, rawOf(n));
    }

    private StatusResult toStatus(JsonNode n) {
        String providerStatus = n.path("status").asString(null);
        FiscalDocument.Status interno = mapearStatus(providerStatus);
        String detail = primeiro(n, "mensagem_sefaz", "status_sefaz");
        String rejeicao = interno == FiscalDocument.Status.REJECTED
                ? rejeicao(n, detail) : null;
        return new StatusResult(interno, providerStatus, detail,
                texto(n, "chave_nfe"), texto(n, "protocolo"),
                texto(n, "numero"), texto(n, "serie"),
                null, null, rejeicao);
    }

    private static FiscalDocument.Status mapearStatus(String providerStatus) {
        if (providerStatus == null) return FiscalDocument.Status.PROCESSING;
        return switch (providerStatus) {
            case "autorizado" -> FiscalDocument.Status.AUTHORIZED;
            case "cancelado", "cancelamento_homologado" -> FiscalDocument.Status.CANCELLED;
            case "erro_autorizacao" -> FiscalDocument.Status.REJECTED;
            case "processando_autorizacao" -> FiscalDocument.Status.PROCESSING;
            default -> FiscalDocument.Status.PROCESSING;
        };
    }

    private static String rejeicao(JsonNode n, String fallback) {
        if (n.has("erros") && n.path("erros").isArray() && !n.path("erros").isEmpty()) {
            JsonNode e = n.path("erros").get(0);
            String m = e.path("mensagem").asString(null);
            if (m != null && !m.isBlank()) return m;
        }
        String m = n.path("mensagem_sefaz").asString(null);
        return m != null && !m.isBlank() ? m : fallback;
    }

    private static String texto(JsonNode n, String campo) {
        JsonNode v = n.get(campo);
        return v != null && !v.isNull() && !v.asString().isBlank() ? v.asString() : null;
    }

    private static String primeiro(JsonNode n, String... campos) {
        for (String c : campos) {
            String v = texto(n, c);
            if (v != null) return v;
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> rawOf(JsonNode n) {
        // Remove campos grandes de artefato — o payload fica auditável, sem
        // duplicar XML/PDF (guardados no object storage).
        var mapa = new LinkedHashMap<>(json.convertValue(n, Map.class));
        mapa.remove("caminho_xml_nota_fiscal");
        mapa.remove("caminho_danfe");
        mapa.remove("caminho_danfe_etiqueta");
        return mapa;
    }

    private static void validarJustificativa(String motivo) {
        String m = motivo == null ? "" : motivo.trim();
        if (m.length() < 15 || m.length() > 255) {
            throw ApiException.validacao(
                    "justificativa de cancelamento deve ter entre 15 e 255 caracteres");
        }
    }

    /** NFE/NFSE compartilham `ref` como identidade — hoje só nfe. */
    private static String docPath(String externalId) {
        return "nfe";
    }
}
