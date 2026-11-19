package com.hweld.operations.notification.application;

import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.notification.domain.NotificationDelivery;
import com.hweld.operations.notification.domain.NotificationDeliveryRepository;
import com.hweld.operations.notification.infrastructure.infobip.InfobipProperties;
import com.hweld.operations.shared.infrastructure.audit.AuditService;
import com.hweld.operations.shared.interfaces.error.ApiException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Casos de uso do módulo Integrações (admin) — estado da conexão Infobip,
 * toggles operacionais, teste de conexão read-only e SMS de teste restrito
 * à lista `test_recipients`. Toda ação sensível é auditada.
 */
@Service
public class IntegrationService {

    public record SmsTesteCmd(String destinatario) {}

    private final IntegrationSettingsRepository settings;
    private final NotificationDeliveryRepository deliveries;
    private final NotificationService notifications;
    private final SmsProvider smsProvider;
    private final InfobipProperties infobip;
    private final AuditService audit;

    public IntegrationService(IntegrationSettingsRepository settings,
            NotificationDeliveryRepository deliveries, NotificationService notifications,
            SmsProvider smsProvider, InfobipProperties infobip, AuditService audit) {
        this.settings = settings;
        this.deliveries = deliveries;
        this.notifications = notifications;
        this.smsProvider = smsProvider;
        this.infobip = infobip;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> status() {
        IntegrationSettings cfg = loadSettings();
        long pendentes = deliveries.countByChannelAndStatusIn("SMS",
                List.of("QUEUED", "FAILED", "UNKNOWN"));
        var ultimo = deliveries.findByChannelOrderByCreatedAtDesc("SMS",
                        org.springframework.data.domain.PageRequest.of(0, 1))
                .getContent().stream().findFirst().orElse(null);
        return Map.ofEntries(
                Map.entry("provedor", (Object) smsProvider.name()),
                Map.entry("envConfigurado", "log".equals(smsProvider.name()) || infobip.configured()),
                Map.entry("baseUrlConfigurada", infobip.baseUrl() != null && !infobip.baseUrl().isBlank()),
                Map.entry("apiKeyConfigurada", infobip.apiKey() != null && !infobip.apiKey().isBlank()),
                Map.entry("remetente", cfg.getSender() != null ? cfg.getSender()
                        : (infobip.sender() != null ? infobip.sender() : "")),
                Map.entry("callbackConfigurado", infobip.dlrAuthToken() != null && !infobip.dlrAuthToken().isBlank()),
                Map.entry("webhookUrl", infobip.webhookUrl() != null ? infobip.webhookUrl() : ""),
                Map.entry("ativado", cfg.isEnabled()),
                Map.entry("maxSegmentos", cfg.getMaxSegments()),
                Map.entry("destinatariosTeste", cfg.getTestRecipients()),
                Map.entry("eventos", cfg.getEvents()),
                Map.entry("ultimaValidacao", cfg.getLastCheck() != null ? cfg.getLastCheck() : Map.of()),
                Map.entry("pendentes", pendentes),
                Map.entry("ultimoEnvio", ultimo != null && ultimo.getSentAt() != null
                        ? ultimo.getSentAt().toString() : ""));
    }

    @Transactional
    public Map<String, Object> atualizarConfig(boolean enabled, String sender,
            int maxSegments, List<String> testRecipients, Map<String, Boolean> events) {
        IntegrationSettings cfg = loadSettings();
        var actor = AuditService.currentActor();
        cfg.atualizar(enabled, sender, maxSegments, testRecipients, events,
                actor.tipo() + ":" + actor.id());
        settings.save(cfg);
        audit.record("integracao.infobip.config", "integration_settings",
                IntegrationSettings.INFOBIP_SMS,
                Map.of("enabled", enabled, "events", events));
        return status();
    }

    /** Teste de conexão read-only — nunca envia SMS (sem custo). */
    @Transactional
    public Map<String, Object> testarConexao() {
        var test = smsProvider.testConnection();
        IntegrationSettings cfg = loadSettings();
        cfg.registrarCheck(test.ok(), test.detail());
        settings.save(cfg);
        audit.record("integracao.infobip.testar_conexao", "integration_settings",
                IntegrationSettings.INFOBIP_SMS, Map.of("ok", test.ok()));
        return Map.of("ok", test.ok(), "detalhe", test.detail());
    }

    /** SMS de teste — somente destinatários da lista configurada (E.164). */
    @Transactional
    public NotificationDelivery enviarSmsTeste(SmsTesteCmd cmd) {
        IntegrationSettings cfg = loadSettings();
        String e164 = PhoneNormalizer.toE164(cmd.destinatario());
        if (e164 == null) {
            throw ApiException.validacao("destinatário inválido — informe um telefone com DDD");
        }
        if (!cfg.isTestRecipientAllowed(e164)) {
            throw ApiException.proibido(
                    "destinatário fora da lista de testes — cadastre-o em Destinatários de teste");
        }
        NotificationDelivery d = notifications.queueSms("sms_test", e164,
                Map.of(), null, null, null, cfg.getMaxSegments());
        audit.record("integracao.infobip.sms_teste", "notification_delivery",
                d.getId().toString(), Map.of("destinatario", mask(e164)));
        return d;
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

    private IntegrationSettings loadSettings() {
        return settings.findById(IntegrationSettings.INFOBIP_SMS)
                .orElseThrow(() -> ApiException.naoEncontrado(
                        "configuração da integração não inicializada (migração V8)"));
    }

    private static String mask(String e164) {
        return e164.substring(0, e164.length() - 4) + "****";
    }
}
