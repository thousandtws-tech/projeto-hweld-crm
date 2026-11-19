package com.hweld.operations.notification.application;

import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.notification.domain.NotificationDelivery;
import com.hweld.operations.notification.domain.NotificationDeliveryRepository;
import com.hweld.operations.notification.domain.ZapiEvent;
import com.hweld.operations.notification.domain.ZapiEventRepository;
import com.hweld.operations.notification.infrastructure.infobip.InfobipProperties;
import com.hweld.operations.notification.infrastructure.zapi.ZapiWhatsAppProvider;
import com.hweld.operations.shared.infrastructure.audit.AuditService;
import com.hweld.operations.shared.infrastructure.security.CredentialCipher;
import com.hweld.operations.shared.interfaces.error.ApiException;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.JsonNode;

/**
 * Casos de uso do card Z-API no módulo Integrações — credenciais cifradas
 * (instance ID + token da instância + Client-Token), estado da sessão
 * WhatsApp, QR de conexão, webhooks auto-configurados com segredo no path,
 * mensagem de teste restrita à allowlist e histórico canal WHATSAPP.
 */
@Service
public class ZapiIntegrationService {

    public record SalvarReq(Long versao, String nomeConta, Map<String, Object> config,
            Map<String, String> segredos) {}
    public record MsgTesteReq(String telefone, String texto) {}

    private final IntegrationSettingsRepository settings;
    private final NotificationDeliveryRepository deliveries;
    private final ZapiEventRepository events;
    private final NotificationService notifications;
    private final ZapiWhatsAppProvider zapi;
    private final InfobipProperties props;
    private final CredentialCipher cipher;
    private final AuditService audit;
    private final SecureRandom random = new SecureRandom();

    public ZapiIntegrationService(IntegrationSettingsRepository settings,
            NotificationDeliveryRepository deliveries, ZapiEventRepository events,
            NotificationService notifications, ZapiWhatsAppProvider zapi,
            InfobipProperties props, CredentialCipher cipher, AuditService audit) {
        this.settings = settings;
        this.deliveries = deliveries;
        this.events = events;
        this.notifications = notifications;
        this.zapi = zapi;
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
        long pendentes = deliveries.countByChannelAndStatusIn("WHATSAPP",
                List.of("QUEUED", "FAILED", "UNKNOWN"));

        // Estado da sessão — best-effort: falha na consulta não derruba a view.
        Map<String, Object> conexao = new TreeMap<>();
        conexao.put("consultado", false);
        if (cfg.credenciaisZapiCompletas()) {
            try {
                JsonNode s = zapi.status();
                if (s != null) {
                    conexao.put("consultado", true);
                    conexao.put("conectado", s.path("connected").asBoolean(false));
                    conexao.put("smartphone", s.path("smartphoneConnected").asBoolean(false));
                    String session = s.path("session").asString("");
                    if (!session.isBlank()) conexao.put("sessao", session);
                }
            } catch (Exception e) {
                conexao.put("erro", "status indisponível: " + e.getMessage());
            }
        }

        Map<String, Object> config = new TreeMap<>();
        config.put("instance_id", cfg.getExternalId() != null ? cfg.getExternalId() : "");
        config.put("envio_pausado", cfg.isEnvioPausado());
        config.put("eventos", cfg.getEvents());
        config.put("destinatarios_teste", cfg.getTestRecipients());
        String callback = callbackBase(cfg, publicBase);
        if (callback != null) {
            config.put("webhook_received", callback + "/received");
            config.put("webhook_delivery", callback + "/delivery");
            config.put("webhook_disconnected", callback + "/disconnected");
        }

        Map<String, Object> view = new TreeMap<>();
        view.put("provedor", "zapi");
        view.put("categoria", "comunicacao");
        view.put("ambiente", "producao");
        view.put("provider_ativo", "zapi");
        view.put("nome_conta", cfg.getNomeConta() != null ? cfg.getNomeConta() : "");
        view.put("habilitado", cfg.isEnabled());
        view.put("estado", estado(cfg, conexao));
        view.put("versao", cfg.getVersao());
        view.put("config", config);
        view.put("conexao", conexao);
        view.put("segredos", Map.of("campos", Map.of(
                "instance_token", cfg.getApiKeyEnc() != null,
                "client_token", cfg.getClientTokenEnc() != null,
                "webhook_secret", cfg.getWebhookSecretEnc() != null)));
        view.put("ultima_verificacao_em", check.getOrDefault("at", ""));
        view.put("verificacao_status",
                check.isEmpty() ? "nunca" : (Boolean.TRUE.equals(check.get("ok")) ? "ok" : "falha"));
        view.put("verificacao_erro",
                Boolean.FALSE.equals(check.get("ok")) ? check.getOrDefault("detail", "") : "");
        view.put("pendentes", pendentes);
        return view;
    }

    private String estado(IntegrationSettings cfg, Map<String, Object> conexao) {
        if (!cfg.credenciaisZapiCompletas()) return "pendente";
        if (Boolean.TRUE.equals(conexao.get("conectado"))) return "ativa";
        if (!cfg.isEnabled()) return "desativada";
        Map<String, Object> check = cfg.getLastCheck();
        if (check != null && Boolean.FALSE.equals(check.get("ok"))) return "falha";
        return "conectando";
    }

    @Transactional
    public Map<String, Object> salvar(SalvarReq req, String publicBase) {
        IntegrationSettings cfg = load();
        if (req.versao() != null && req.versao() != cfg.getVersao()) {
            throw ApiException.conflito(
                    "integração alterada por outro administrador — recarregue antes de salvar");
        }
        Map<String, Object> c = req.config() != null ? req.config() : Map.of();
        var actor = AuditService.currentActor();
        cfg.atualizarZapi(
                req.nomeConta(),
                cfg.isEnabled(),
                stringOf(c.get("instance_id")),
                Boolean.TRUE.equals(c.get("envio_pausado")),
                listOfStrings(c.get("destinatarios_teste")),
                mapOfBooleans(c.get("eventos")),
                actor.tipo() + ":" + actor.id());

        // Segredos write-only: chave presente atualiza ("" limpa), ausente mantém.
        if (req.segredos() != null) {
            if (req.segredos().containsKey("instance_token")) {
                String key = req.segredos().get("instance_token");
                cfg.definirApiKey(key == null || key.isBlank() ? null : cipher.encrypt(key.trim()));
            }
            if (req.segredos().containsKey("client_token")) {
                String key = req.segredos().get("client_token");
                cfg.definirClientToken(key == null || key.isBlank() ? null : cipher.encrypt(key.trim()));
            }
        }
        // Segredo dos webhooks: gerado no servidor na 1ª gravação.
        if (cfg.getWebhookSecretEnc() == null) {
            byte[] raw = new byte[24];
            random.nextBytes(raw);
            cfg.definirWebhookSecret(cipher.encrypt(HexFormat.of().formatHex(raw)));
        }
        settings.save(cfg);

        // Auto-configura os webhooks da instância apontando para cá.
        String callback = callbackBase(cfg, publicBase);
        if (cfg.credenciaisZapiCompletas() && callback != null) {
            try {
                zapi.configureWebhooks(callback);
            } catch (Exception e) {
                // Não bloqueia o save — pendência aparece na view.
                org.slf4j.LoggerFactory.getLogger(getClass())
                        .warn("zapi webhooks não configurados: {}", e.getMessage());
            }
        }
        audit.record("integracao.zapi.salvar", "integration_settings",
                IntegrationSettings.ZAPI_WHATSAPP,
                Map.of("tokensDefinidos", cfg.getApiKeyEnc() != null && cfg.getClientTokenEnc() != null));
        return view(publicBase);
    }

    @Transactional
    public Map<String, Object> habilitar(boolean habilitado, String publicBase) {
        IntegrationSettings cfg = load();
        var actor = AuditService.currentActor();
        cfg.atualizarZapi(cfg.getNomeConta(), habilitado, cfg.getExternalId(),
                cfg.isEnvioPausado(), cfg.getTestRecipients(), cfg.getEvents(),
                actor.tipo() + ":" + actor.id());
        settings.save(cfg);
        audit.record("integracao.zapi.habilitacao", "integration_settings",
                IntegrationSettings.ZAPI_WHATSAPP, Map.of("habilitado", habilitado));
        return view(publicBase);
    }

    /** Teste de conexão read-only — `GET /status`, nunca envia mensagem. */
    @Transactional
    public Map<String, Object> testarConexao() {
        var test = zapi.testConnection();
        IntegrationSettings cfg = load();
        cfg.registrarCheck(test.ok(), test.detail());
        settings.save(cfg);
        audit.record("integracao.zapi.testar_conexao", "integration_settings",
                IntegrationSettings.ZAPI_WHATSAPP, Map.of("ok", test.ok()));
        Map<String, Object> out = new TreeMap<>();
        out.put("verificacao_status", test.ok() ? "ok" : "falha");
        out.put("mensagem", test.detail());
        return out;
    }

    /** QR Code da sessão — `{value: "data:image/png;base64,..."}` ou challenge. */
    @Transactional(readOnly = true)
    public Map<String, Object> qrCode() {
        if (!zapi.configured()) {
            throw ApiException.validacao("credenciais ausentes — salve a configuração primeiro");
        }
        JsonNode qr = zapi.qrCode();
        Map<String, Object> out = new TreeMap<>();
        if (qr != null && qr.hasNonNull("value")) {
            out.put("imagem", qr.path("value").asString());
        } else if (qr != null && qr.hasNonNull("challenge")) {
            out.put("erro", "instância exige Passkey — conclua o desafio no painel Z-API");
        } else {
            out.put("erro", "QR indisponível — a instância pode já estar conectada");
        }
        return out;
    }

    /** Desconecta o número da instância (ação explícita do admin). */
    @Transactional
    public Map<String, Object> desconectar(String publicBase) {
        try {
            zapi.disconnect();
        } catch (Exception e) {
            throw ApiException.provedorIndisponivel("falha ao desconectar: " + e.getMessage());
        }
        audit.record("integracao.zapi.desconectar", "integration_settings",
                IntegrationSettings.ZAPI_WHATSAPP, Map.of());
        return view(publicBase);
    }

    /** Mensagem de teste — allowlist vazia libera; preenchida restringe. */
    @Transactional
    public Map<String, Object> mensagemTeste(MsgTesteReq req) {
        IntegrationSettings cfg = load();
        String e164 = PhoneNormalizer.toE164(req.telefone());
        if (e164 == null) {
            throw ApiException.validacao("telefone inválido — informe com DDI e DDD");
        }
        if (!cfg.isTestRecipientAllowed(e164)) {
            throw ApiException.proibido(
                    "destinatário fora da lista de testes — cadastre-o em Destinatários de teste");
        }
        String texto = req.texto() != null && !req.texto().isBlank()
                ? req.texto().trim()
                : "HWeld: mensagem de teste da integração Z-API. Nenhuma ação necessária.";
        NotificationDelivery d = notifications.queueWhatsAppText(e164, texto,
                null, null, null);
        audit.record("integracao.zapi.mensagem_teste", "notification_delivery",
                d.getId().toString(), Map.of("destinatario", mask(e164)));
        return Map.of("aceito", true, "id", d.getId().toString());
    }

    /** Últimos eventos de webhook — "Eventos" do card. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> eventos(int limite) {
        var page = events.findByOrderByRecebidoEmDesc(
                PageRequest.of(0, Math.min(Math.max(limite, 1), 50)));
        List<Map<String, Object>> out = new ArrayList<>();
        for (ZapiEvent e : page) {
            Map<String, Object> m = new TreeMap<>();
            m.put("id", e.getId().toString());
            m.put("tipo", e.getTipo());
            m.put("direcao", e.getDirection());
            m.put("telefone", e.getPhone() != null ? e.getPhone() : "");
            m.put("conteudo", e.getConteudo() != null ? e.getConteudo() : "");
            m.put("recebido_em", e.getRecebidoEm().toString());
            out.add(m);
        }
        return out;
    }

    /** Reprocessamento auditado de um delivery WhatsApp. */
    @Transactional
    public NotificationDelivery reprocessar(UUID deliveryId) {
        NotificationDelivery d = notifications.get(deliveryId);
        if (!"WHATSAPP".equals(d.getChannel())) {
            throw ApiException.validacao("reprocessamento por esta integração é somente WhatsApp");
        }
        notifications.retry(deliveryId);
        audit.record("integracao.zapi.reprocessar", "notification_delivery",
                deliveryId.toString(), Map.of("statusAnterior", d.getStatus()));
        return notifications.get(deliveryId);
    }

    private String callbackBase(IntegrationSettings cfg, String publicBase) {
        if (cfg.getWebhookSecretEnc() == null) return null;
        String base = props.publicBaseUrl() != null && !props.publicBaseUrl().isBlank()
                ? props.publicBaseUrl() : publicBase;
        if (base == null || base.isBlank()) return null;
        return base + "/api/v1/webhooks/zapi/" + cipher.decrypt(cfg.getWebhookSecretEnc());
    }

    private IntegrationSettings load() {
        return settings.findById(IntegrationSettings.ZAPI_WHATSAPP)
                .orElseGet(() -> settings.save(IntegrationSettings.criar(IntegrationSettings.ZAPI_WHATSAPP)));
    }

    private static String stringOf(Object v) {
        return v instanceof String s ? s : null;
    }

    private static List<String> listOfStrings(Object v) {
        if (!(v instanceof List<?> l)) return null;
        List<String> out = new ArrayList<>();
        for (Object o : l) if (o instanceof String s && !s.isBlank()) out.add(s.trim());
        return out;
    }

    private static Map<String, Boolean> mapOfBooleans(Object v) {
        if (!(v instanceof Map<?, ?> m)) return null;
        Map<String, Boolean> out = new TreeMap<>();
        for (var e : m.entrySet()) {
            if (e.getKey() instanceof String k && e.getValue() instanceof Boolean b) out.put(k, b);
        }
        return out;
    }

    private static String mask(String e164) {
        return e164.substring(0, e164.length() - 4) + "****";
    }
}
