package com.hweld.operations.fiscal.application;

import com.hweld.operations.fiscal.domain.FiscalDocument;
import com.hweld.operations.fiscal.domain.FiscalDocumentRepository;
import com.hweld.operations.fiscal.domain.FiscalWebhookEvent;
import com.hweld.operations.fiscal.domain.FiscalWebhookEventRepository;
import com.hweld.operations.fiscal.infrastructure.spedy.SpedyClient;
import com.hweld.operations.fiscal.infrastructure.spedy.SpedyProvider;
import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.notification.infrastructure.infobip.InfobipProperties;
import com.hweld.operations.shared.infrastructure.audit.AuditService;
import com.hweld.operations.shared.infrastructure.security.CredentialCipher;
import com.hweld.operations.shared.interfaces.error.ApiException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * Casos de uso do card Spedy no módulo Integrações — credenciais fiscais
 * gerenciadas pelo cliente: `X-Api-Key` cifrada (write-only), ambiente
 * sandbox/produção, habilitação, pausa de emissão, teste de conexão e
 * auto-configuração do webhook assinado da conta (`invoice.status_changed`
 * + segredo `whsec_` via `GET /v1/webhooks/secret`).
 *
 * Após salvar credenciais válidas o serviço tenta: buscar o segredo de
 * assinatura da conta e registrar o webhook apontando para cá. Falhas não
 * bloqueiam o save — aparecem como pendências na view.
 */
@Service
public class SpedyIntegrationService {

    private static final Logger log = LoggerFactory.getLogger(SpedyIntegrationService.class);
    private static final String EVENTO_WEBHOOK = "invoice.status_changed";

    public record SalvarReq(Long versao, String nomeConta, Map<String, Object> config,
            Map<String, String> segredos) {}

    private final IntegrationSettingsRepository settings;
    private final FiscalWebhookEventRepository webhookEvents;
    private final FiscalDocumentRepository documents;
    private final SpedyClient client;
    private final InfobipProperties props;
    private final CredentialCipher cipher;
    private final AuditService audit;

    public SpedyIntegrationService(IntegrationSettingsRepository settings,
            FiscalWebhookEventRepository webhookEvents, FiscalDocumentRepository documents,
            SpedyClient client, InfobipProperties props, CredentialCipher cipher,
            AuditService audit) {
        this.settings = settings;
        this.webhookEvents = webhookEvents;
        this.documents = documents;
        this.client = client;
        this.props = props;
        this.cipher = cipher;
        this.audit = audit;
    }

    /** Visão pública — segredos só como flags `configurado`, nunca valores. */
    @Transactional(readOnly = true)
    public Map<String, Object> view(String publicBase) {
        IntegrationSettings cfg = load();
        Map<String, Object> check = cfg.getLastCheck() != null
                ? cfg.getLastCheck() : Map.of();

        Map<String, Object> config = new TreeMap<>();
        config.put("ambiente", ambiente(cfg));
        config.put("emissao_pausada", cfg.isEnvioPausado());
        config.put("empresa_id", cfg.getExternalId() != null ? cfg.getExternalId() : "");
        String callback = callbackUrl(publicBase);
        if (callback != null) config.put("webhook_url", callback);

        Map<String, Object> view = new TreeMap<>();
        view.put("provedor", "spedy");
        view.put("categoria", "fiscal");
        view.put("ambiente", ambiente(cfg));
        view.put("provider_ativo", cfg.isEnabled() && cfg.credenciaisSpedyCompletas()
                ? SpedyProvider.NAME : "");
        view.put("nome_conta", cfg.getNomeConta() != null ? cfg.getNomeConta() : "");
        view.put("habilitado", cfg.isEnabled());
        view.put("estado", estado(cfg));
        view.put("versao", cfg.getVersao());
        view.put("config", config);
        view.put("segredos", Map.of("campos", Map.of(
                "api_key", cfg.getApiKeyEnc() != null,
                "webhook_secret", cfg.getWebhookSecretEnc() != null)));
        view.put("ultima_verificacao_em", check.getOrDefault("at", ""));
        view.put("verificacao_status",
                check.isEmpty() ? "nunca" : (Boolean.TRUE.equals(check.get("ok")) ? "ok" : "falha"));
        view.put("verificacao_erro",
                Boolean.FALSE.equals(check.get("ok")) ? check.getOrDefault("detail", "") : "");
        view.put("pendentes", documents.findByProviderOrderByCreatedAtDesc(
                SpedyProvider.NAME, PageRequest.of(0, 50)).getContent().stream()
                .filter(d -> List.of("REQUESTED", "PROCESSING", "REQUIRES_RECONCILIATION",
                        "CANCELLATION_PENDING").contains(d.getStatus()))
                .count());
        return view;
    }

    private String estado(IntegrationSettings cfg) {
        if (!cfg.isEnabled()) return "desativada";
        if (!cfg.credenciaisSpedyCompletas()) return "pendente";
        Map<String, Object> check = cfg.getLastCheck();
        if (check != null && Boolean.FALSE.equals(check.get("ok"))) return "falha";
        return "ativa";
    }

    @Transactional
    public Map<String, Object> salvar(SalvarReq req, String publicBase) {
        IntegrationSettings cfg = load();
        if (req.versao() != null && req.versao() != cfg.getVersao()) {
            throw ApiException.conflito(
                    "integração alterada por outro administrador — recarregue antes de salvar");
        }
        Map<String, Object> c = req.config() != null ? req.config() : Map.of();
        // `ambiente` ausente mantém a base URL atual — PUT parcial não apaga o ambiente.
        String baseUrl = c.containsKey("ambiente")
                ? baseUrlDoAmbiente(c.get("ambiente")) : cfg.getBaseUrl();
        var actor = AuditService.currentActor();
        cfg.atualizarSpedy(
                req.nomeConta(),
                cfg.isEnabled(), // habilitação tem endpoint próprio
                baseUrl,
                cfg.getExternalId(),
                Boolean.TRUE.equals(c.get("emissao_pausada")),
                mapOfBooleans(c.get("eventos")),
                actor.tipo() + ":" + actor.id());

        // Segredos write-only: chave presente atualiza ("" limpa), ausente mantém.
        if (req.segredos() != null && req.segredos().containsKey("api_key")) {
            String key = req.segredos().get("api_key");
            cfg.definirApiKey(key == null || key.isBlank() ? null : cipher.encrypt(key.trim()));
        }
        settings.save(cfg);

        // Auto-setup da conta Spedy: segredo whsec_ + webhook apontando para cá.
        if (cfg.credenciaisSpedyCompletas()) {
            sincronizarConta(cfg, publicBase);
        }
        audit.record("integracao.spedy.salvar", "integration_settings",
                IntegrationSettings.SPEDY_FISCAL,
                Map.of("apiKeyDefinida", cfg.getApiKeyEnc() != null));
        return view(publicBase);
    }

    /**
     * Busca o segredo de assinatura e registra o webhook `invoice.status_changed`.
     * Cada falha é tolerada individualmente — a view reflete o que ficou pendente.
     */
    private void sincronizarConta(IntegrationSettings cfg, String publicBase) {
        try {
            JsonNode empresa = client.listarEmpresas();
            String id = primeiroId(empresa);
            if (id != null) cfg.atualizarSpedy(cfg.getNomeConta(), cfg.isEnabled(),
                    cfg.getBaseUrl(), id, cfg.isEnvioPausado(), cfg.getEvents(), "sync:spedy");
        } catch (Exception e) {
            log.warn("spedy: consulta de empresa falhou: {}", e.getMessage());
        }
        try {
            String segredo = client.segredoWebhook().path("secret").asString(null);
            if (segredo != null && !segredo.isBlank()) {
                cfg.definirWebhookSecret(cipher.encrypt(segredo));
            }
        } catch (Exception e) {
            log.warn("spedy: segredo de webhook não obtido: {}", e.getMessage());
        }
        String callback = callbackUrl(publicBase);
        if (callback != null) {
            try {
                registrarWebhook(callback);
            } catch (Exception e) {
                log.warn("spedy: webhook não registrado: {}", e.getMessage());
            }
        }
        settings.save(cfg);
    }

    /** Cria o webhook se ainda não existir um `{event,url}` igual na conta. */
    private void registrarWebhook(String url) {
        JsonNode lista = client.listarWebhooks();
        if (lista != null) {
            JsonNode arr = lista.isArray() ? lista
                    : lista.has("data") && lista.path("data").isArray() ? lista.path("data")
                    : lista.has("items") && lista.path("items").isArray() ? lista.path("items")
                    : lista.has("content") && lista.path("content").isArray() ? lista.path("content")
                    : null;
            if (arr != null) {
                for (JsonNode w : arr) {
                    if (EVENTO_WEBHOOK.equals(w.path("event").asString())
                            && url.equals(w.path("url").asString())) {
                        return; // já registrado
                    }
                }
            }
        }
        client.criarWebhook(EVENTO_WEBHOOK, url);
    }

    private static String primeiroId(JsonNode resp) {
        JsonNode arr = resp == null ? null
                : resp.isArray() ? resp
                : resp.has("data") && resp.path("data").isArray() ? resp.path("data")
                : resp.has("items") && resp.path("items").isArray() ? resp.path("items")
                : resp.has("content") && resp.path("content").isArray() ? resp.path("content")
                : null;
        return arr != null && !arr.isEmpty()
                ? arr.get(0).path("id").asString(null) : null;
    }

    @Transactional
    public Map<String, Object> habilitar(boolean habilitado, String publicBase) {
        IntegrationSettings cfg = load();
        var actor = AuditService.currentActor();
        cfg.atualizarSpedy(cfg.getNomeConta(), habilitado, cfg.getBaseUrl(),
                cfg.getExternalId(), cfg.isEnvioPausado(), cfg.getEvents(),
                actor.tipo() + ":" + actor.id());
        settings.save(cfg);
        audit.record("integracao.spedy.habilitacao", "integration_settings",
                IntegrationSettings.SPEDY_FISCAL, Map.of("habilitado", habilitado));
        return view(publicBase);
    }

    /**
     * Teste de conexão read-only — `GET /v1/companies?pageSize=1`.
     * Em sucesso, aproveita para sincronizar empresa + segredo + webhook.
     */
    @Transactional
    public Map<String, Object> testarConexao(String publicBase) {
        IntegrationSettings cfg = load();
        boolean ok;
        String detail;
        try {
            JsonNode empresas = client.listarEmpresas();
            String id = primeiroId(empresas);
            ok = true;
            detail = id != null
                    ? "conta acessível — empresa " + id
                    : "conta acessível — nenhuma empresa retornada";
        } catch (Exception e) {
            ok = false;
            detail = e.getMessage();
        }
        cfg.registrarCheck(ok, detail);
        settings.save(cfg);
        if (ok && cfg.credenciaisSpedyCompletas()) {
            sincronizarConta(cfg, publicBase);
        }
        audit.record("integracao.spedy.testar_conexao", "integration_settings",
                IntegrationSettings.SPEDY_FISCAL, Map.of("ok", ok));
        Map<String, Object> out = new TreeMap<>();
        out.put("verificacao_status", ok ? "ok" : "falha");
        out.put("mensagem", detail);
        return out;
    }

    /** Eventos de webhook recebidos da Spedy — aba "Eventos". */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> eventos(int limite) {
        var page = webhookEvents.findByProviderOrderByReceivedAtDesc(
                SpedyProvider.NAME, PageRequest.of(0, Math.min(Math.max(limite, 1), 50)));
        List<Map<String, Object>> out = new ArrayList<>();
        for (FiscalWebhookEvent e : page) {
            Map<String, Object> m = new TreeMap<>();
            m.put("id", e.getId().toString());
            m.put("evento", e.getEventKey());
            m.put("resultado", e.getProcessingResult() != null ? e.getProcessingResult() : "");
            m.put("documento", e.getFiscalDocumentId() != null
                    ? e.getFiscalDocumentId().toString() : "");
            m.put("erro", e.getErrorMessage() != null ? e.getErrorMessage() : "");
            m.put("recebido_em", e.getReceivedAt().toString());
            out.add(m);
        }
        return out;
    }

    /** Últimos documentos fiscais emitidos via Spedy — aba "Histórico". */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> documentos(int limite) {
        var page = documents.findByProviderOrderByCreatedAtDesc(
                SpedyProvider.NAME, PageRequest.of(0, Math.min(Math.max(limite, 1), 50)));
        List<Map<String, Object>> out = new ArrayList<>();
        for (FiscalDocument d : page) {
            Map<String, Object> m = new TreeMap<>();
            m.put("id", d.getId().toString());
            m.put("pedido_id", d.getPedidoId());
            m.put("tipo", d.getDocType());
            m.put("status", d.getStatus());
            m.put("status_provedor", d.getProviderStatus() != null ? d.getProviderStatus() : "");
            m.put("numero", d.getNumero() != null ? d.getNumero() : "");
            m.put("serie", d.getSerie() != null ? d.getSerie() : "");
            m.put("motivo_rejeicao", d.getRejectionReason() != null ? d.getRejectionReason() : "");
            m.put("criado_em", d.getCreatedAt().toString());
            out.add(m);
        }
        return out;
    }

    private String callbackUrl(String publicBase) {
        String base = props.publicBaseUrl() != null && !props.publicBaseUrl().isBlank()
                ? props.publicBaseUrl() : publicBase;
        if (base == null || base.isBlank()) return null;
        return base + "/api/v1/webhooks/fiscal/spedy";
    }

    private static String ambiente(IntegrationSettings cfg) {
        String u = cfg.getBaseUrl();
        if (u == null || u.isBlank()) return "";
        return u.contains("sandbox") ? "homologacao" : "producao";
    }

    /** `ambiente` aceito: `homologacao|sandbox|producao|production` → base URL oficial. */
    private static String baseUrlDoAmbiente(Object ambiente) {
        if (!(ambiente instanceof String a) || a.isBlank()) return null;
        return switch (a.trim().toLowerCase()) {
            case "homologacao", "sandbox" -> SpedyClient.URL_SANDBOX;
            case "producao", "production" -> SpedyClient.URL_PRODUCAO;
            default -> throw ApiException.validacao(
                    "ambiente inválido — use sandbox (homologação) ou producao");
        };
    }

    private IntegrationSettings load() {
        return settings.findById(IntegrationSettings.SPEDY_FISCAL)
                .orElseGet(() -> settings.save(IntegrationSettings.criar(IntegrationSettings.SPEDY_FISCAL)));
    }

    private static Map<String, Boolean> mapOfBooleans(Object v) {
        if (!(v instanceof Map<?, ?> m)) return null;
        Map<String, Boolean> out = new TreeMap<>();
        for (var e : m.entrySet()) {
            if (e.getKey() instanceof String k && e.getValue() instanceof Boolean b) out.put(k, b);
        }
        return out;
    }
}
