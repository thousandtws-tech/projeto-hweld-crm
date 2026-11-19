package com.hweld.operations.notification.application;

import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.notification.domain.NotificationDelivery;
import com.hweld.operations.notification.domain.NotificationDeliveryRepository;
import com.hweld.operations.notification.infrastructure.infobip.InfobipProperties;
import com.hweld.operations.notification.infrastructure.infobip.InfobipSmsProvider;
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

/**
 * Casos de uso do módulo Integrações (admin) — configuração da Infobip
 * gerenciada pelo cliente: credenciais cifradas (write-only), segredo de
 * webhook gerado no servidor, optimistic locking por `versao`, teste de
 * conexão read-only persistido e SMS de teste restrito à allowlist quando
 * ela está preenchida. Toda ação sensível é auditada.
 */
@Service
public class IntegrationService {

    public record SalvarReq(Long versao, String nomeConta, Map<String, Object> config,
            Map<String, String> segredos) {}
    public record SmsTesteReq(String telefone, String texto) {}

    private final IntegrationSettingsRepository settings;
    private final NotificationDeliveryRepository deliveries;
    private final NotificationService notifications;
    private final SmsProvider smsProvider;
    private final InfobipSmsProvider infobip;
    private final InfobipProperties props;
    private final CredentialCipher cipher;
    private final AuditService audit;
    private final SecureRandom random = new SecureRandom();

    public IntegrationService(IntegrationSettingsRepository settings,
            NotificationDeliveryRepository deliveries, NotificationService notifications,
            SmsProvider smsProvider, InfobipSmsProvider infobip, InfobipProperties props,
            CredentialCipher cipher, AuditService audit) {
        this.settings = settings;
        this.deliveries = deliveries;
        this.notifications = notifications;
        this.smsProvider = smsProvider;
        this.infobip = infobip;
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
        long pendentes = deliveries.countByChannelAndStatusIn("SMS",
                List.of("QUEUED", "FAILED", "UNKNOWN"));

        Map<String, Object> config = new TreeMap<>();
        config.put("base_url", cfg.getBaseUrl() != null ? cfg.getBaseUrl() : "");
        config.put("remetente", cfg.getSender() != null ? cfg.getSender() : "");
        config.put("limite_segmentos", cfg.getMaxSegments());
        config.put("envio_pausado", cfg.isEnvioPausado());
        config.put("eventos", cfg.getEvents());
        config.put("destinatarios_teste", cfg.getTestRecipients());
        String callback = callbackUrl(cfg, publicBase);
        if (callback != null) config.put("callback_url", callback);

        Map<String, Object> view = new TreeMap<>();
        view.put("provedor", "infobip");
        view.put("categoria", "comunicacao");
        view.put("ambiente", "producao");
        view.put("provider_ativo", smsProvider.name());
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
        view.put("pendentes", pendentes);
        return view;
    }

    private String estado(IntegrationSettings cfg) {
        if (!cfg.isEnabled()) return "desativada";
        if (!cfg.credenciaisCompletas()) return "pendente";
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
        String baseUrl = stringOf(c.get("base_url"));
        if (baseUrl != null && !baseUrl.isBlank() && !baseUrl.startsWith("https://")) {
            throw ApiException.validacao("base URL deve ser HTTPS (ex.: https://xxxx.api.infobip.com)");
        }
        int limite = c.get("limite_segmentos") instanceof Number n ? n.intValue() : 3;
        var actor = AuditService.currentActor();
        cfg.atualizar(
                req.nomeConta(),
                cfg.isEnabled(), // habilitação tem endpoint próprio
                baseUrl,
                stringOf(c.get("remetente")),
                limite,
                Boolean.TRUE.equals(c.get("envio_pausado")),
                listOfStrings(c.get("destinatarios_teste")),
                mapOfBooleans(c.get("eventos")),
                actor.tipo() + ":" + actor.id());

        // Segredos write-only: chave presente atualiza ("" limpa), ausente mantém.
        if (req.segredos() != null && req.segredos().containsKey("api_key")) {
            String key = req.segredos().get("api_key");
            cfg.definirApiKey(key == null || key.isBlank() ? null : cipher.encrypt(key.trim()));
        }
        // Segredo do DLR: gerado no servidor na 1ª gravação — nunca do cliente.
        if (cfg.getWebhookSecretEnc() == null) {
            byte[] raw = new byte[24];
            random.nextBytes(raw);
            cfg.definirWebhookSecret(cipher.encrypt(HexFormat.of().formatHex(raw)));
        }
        settings.save(cfg);
        audit.record("integracao.infobip.salvar", "integration_settings",
                IntegrationSettings.INFOBIP_SMS,
                Map.of("apiKeyDefinida", cfg.getApiKeyEnc() != null));
        return view(publicBase);
    }

    @Transactional
    public Map<String, Object> habilitar(boolean habilitado, String publicBase) {
        IntegrationSettings cfg = load();
        var actor = AuditService.currentActor();
        cfg.atualizar(cfg.getNomeConta(), habilitado, cfg.getBaseUrl(), cfg.getSender(),
                cfg.getMaxSegments(), cfg.isEnvioPausado(), cfg.getTestRecipients(),
                cfg.getEvents(), actor.tipo() + ":" + actor.id());
        settings.save(cfg);
        audit.record("integracao.infobip.habilitacao", "integration_settings",
                IntegrationSettings.INFOBIP_SMS, Map.of("habilitado", habilitado));
        return view(publicBase);
    }

    /** Teste de conexão read-only — nunca envia SMS (sem custo). */
    @Transactional
    public Map<String, Object> testarConexao() {
        var test = infobip.testConnection();
        IntegrationSettings cfg = load();
        cfg.registrarCheck(test.ok(), test.detail());
        settings.save(cfg);
        audit.record("integracao.infobip.testar_conexao", "integration_settings",
                IntegrationSettings.INFOBIP_SMS, Map.of("ok", test.ok()));
        Map<String, Object> out = new TreeMap<>();
        out.put("verificacao_status", test.ok() ? "ok" : "falha");
        out.put("mensagem", test.detail());
        if (test.ok() && cfg.getNomeConta() != null) out.put("nome_conta", cfg.getNomeConta());
        return out;
    }

    /**
     * SMS de teste — allowlist vazia libera qualquer destinatário válido;
     * preenchida restringe (padrão da referência).
     */
    @Transactional
    public Map<String, Object> enviarSmsTeste(SmsTesteReq req) {
        IntegrationSettings cfg = load();
        String e164 = PhoneNormalizer.toE164(req.telefone());
        if (e164 == null) {
            throw ApiException.validacao("telefone inválido — informe com DDI e DDD");
        }
        if (!cfg.isTestRecipientAllowed(e164)) {
            throw ApiException.proibido(
                    "destinatário fora da lista de testes — cadastre-o em Destinatários de teste");
        }
        if (req.texto() != null && !req.texto().isBlank()) {
            // Texto livre não passa por template — enfileira como aviso avulso.
            NotificationDelivery d = notifications.queueSmsText(e164, req.texto().trim(),
                    null, null, null, cfg.getMaxSegments());
            audit.record("integracao.infobip.sms_teste", "notification_delivery",
                    d.getId().toString(), Map.of("destinatario", mask(e164)));
            return Map.of("aceito", true, "id", d.getId().toString());
        }
        NotificationDelivery d = notifications.queueSms("sms_test", e164,
                Map.of(), null, null, null, cfg.getMaxSegments());
        audit.record("integracao.infobip.sms_teste", "notification_delivery",
                d.getId().toString(), Map.of("destinatario", mask(e164)));
        return Map.of("aceito", true, "id", d.getId().toString());
    }

    /** Últimos DLRs recebidos — "Eventos de webhook" do card. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> eventos(int limite) {
        var page = deliveries.findLatestDlr(
                "SMS", PageRequest.of(0, Math.min(Math.max(limite, 1), 50)));
        List<Map<String, Object>> out = new ArrayList<>();
        for (NotificationDelivery d : page.getContent()) {
            Map<String, Object> e = new TreeMap<>();
            e.put("event_id", d.getMessageId() != null ? d.getMessageId() : d.getId().toString());
            e.put("status", d.getRemoteStatus() != null ? d.getRemoteStatus()
                    : d.getStatus().toLowerCase());
            e.put("recebido_em", recebidoEm(d));
            e.put("ultimo_erro", d.getLastError() != null ? d.getLastError() : "");
            out.add(e);
        }
        return out;
    }

    /** Reprocessamento auditado de um delivery SMS (admin confirma explicitamente). */
    @Transactional
    public NotificationDelivery reprocessar(UUID deliveryId) {
        NotificationDelivery d = notifications.get(deliveryId);
        if (!"SMS".equals(d.getChannel())) {
            throw ApiException.validacao("reprocessamento por esta integração é somente SMS");
        }
        notifications.retry(deliveryId);
        audit.record("integracao.infobip.reprocessar", "notification_delivery",
                deliveryId.toString(), Map.of("statusAnterior", d.getStatus()));
        return notifications.get(deliveryId);
    }

    private String callbackUrl(IntegrationSettings cfg, String publicBase) {
        if (cfg.getWebhookSecretEnc() == null) return null;
        String base = props.publicBaseUrl() != null && !props.publicBaseUrl().isBlank()
                ? props.publicBaseUrl() : publicBase;
        if (base == null || base.isBlank()) return null;
        return base + "/api/v1/webhooks/infobip/sms/dlr/" + cipher.decrypt(cfg.getWebhookSecretEnc());
    }

    /** Timestamp do último DLR — `doneDate` do relatório ou deliveredAt/sentAt. */
    private static String recebidoEm(NotificationDelivery d) {
        var reports = d.getDlr();
        if (reports != null && !reports.isEmpty()) {
            Object done = reports.get(reports.size() - 1).get("doneDate");
            if (done instanceof String s && !s.isBlank()) return s;
        }
        if (d.getDeliveredAt() != null) return d.getDeliveredAt().toString();
        return d.getSentAt() != null ? d.getSentAt().toString() : "";
    }

    private IntegrationSettings load() {
        return settings.findById(IntegrationSettings.INFOBIP_SMS)
                .orElseGet(() -> settings.save(IntegrationSettings.criar(IntegrationSettings.INFOBIP_SMS)));
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
