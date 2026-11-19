package com.hweld.operations.notification.application;

import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.notification.domain.NotificationDelivery;
import com.hweld.operations.notification.domain.NotificationDeliveryRepository;
import com.hweld.operations.notification.domain.ZapiEvent;
import com.hweld.operations.notification.domain.ZapiEventRepository;
import com.hweld.operations.shared.infrastructure.security.CredentialCipher;
import com.hweld.operations.shared.interfaces.error.ApiException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Processa webhooks Z-API — `received` (mensagens), `delivery` (aceite pelo
 * WhatsApp) e `disconnected` (queda da sessão). A Z-API não assina o payload:
 * a autenticação é o segredo gerado no servidor presente no path da URL
 * (controle compensatório documentado), comparado em tempo constante.
 */
@Service
public class ZapiWebhookService {

    private static final Logger log = LoggerFactory.getLogger(ZapiWebhookService.class);

    private final IntegrationSettingsRepository settings;
    private final ZapiEventRepository events;
    private final NotificationDeliveryRepository deliveries;
    private final CredentialCipher cipher;

    public ZapiWebhookService(IntegrationSettingsRepository settings,
            ZapiEventRepository events, NotificationDeliveryRepository deliveries,
            CredentialCipher cipher) {
        this.settings = settings;
        this.events = events;
        this.deliveries = deliveries;
        this.cipher = cipher;
    }

    /**
     * Valida o segredo do path — fail-closed: sem segredo configurado,
     * nada passa. Comparação em tempo constante.
     */
    public enum Auth { OK, UNCONFIGURED, INVALID }

    public Auth checkSecret(String presented) {
        IntegrationSettings cfg = settings.findById(IntegrationSettings.ZAPI_WHATSAPP).orElse(null);
        if (cfg == null || cfg.getWebhookSecretEnc() == null) return Auth.UNCONFIGURED;
        if (presented == null) return Auth.INVALID;
        byte[] esperado = cipher.decrypt(cfg.getWebhookSecretEnc()).getBytes(StandardCharsets.UTF_8);
        byte[] recebido = presented.getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(esperado, recebido) ? Auth.OK : Auth.INVALID;
    }

    /**
     * `ReceivedCallback` — mensagem recebida pelo número conectado.
     * Ignora fromMe/fromApi (eco dos nossos envios) e deduplica por zaapId.
     */
    @Transactional
    public void received(Map<String, Object> p) {
        String instanceId = str(p.get("instanceId"));
        String zaapId = str(p.get("zaapId"));
        String phone = str(p.get("phone"));
        boolean fromMe = Boolean.TRUE.equals(p.get("fromMe"))
                || Boolean.TRUE.equals(p.get("fromApi"));
        String texto = textoDe(p);

        if (instanceId != null && zaapId != null
                && events.existsByInstanceIdAndTipoAndZaapId(instanceId, "ReceivedCallback", zaapId)) {
            return; // duplicado — Z-API reenvia em caso de timeout
        }
        ZapiEvent e = new ZapiEvent(instanceId != null ? instanceId : "?",
                "ReceivedCallback", zaapId, phone, fromMe ? "out" : "in", texto, p);
        events.save(e);
        if (!fromMe) {
            log.info("zapi inbound instance={} phone={} zaapId={}", instanceId, mask(phone), zaapId);
        }
    }

    /**
     * `DeliveryCallback` — mensagem entregue aos servidores WhatsApp.
     * Correlaciona por zaapId/messageId → marca DELIVERED; erro vira lastError.
     */
    @Transactional
    public void delivery(Map<String, Object> p) {
        String instanceId = str(p.get("instanceId"));
        String zaapId = str(p.get("zaapId"));
        String messageId = str(p.get("messageId"));
        String phone = str(p.get("phone"));
        String error = str(p.get("error"));

        String key = zaapId != null ? zaapId : messageId;
        if (key != null) {
            var match = deliveries.findByMessageId(key);
            if (match.isEmpty() && messageId != null) {
                match = deliveries.findByMessageId(messageId);
            }
            match.ifPresent(d -> {
                if (error != null && !error.isBlank()) {
                    d.applyDlr(NotificationDelivery.Status.FAILED, "ZAPI_ERROR:" + error, p);
                } else {
                    d.applyDlr(NotificationDelivery.Status.DELIVERED, "DELIVERED", p);
                }
                deliveries.save(d);
            });
            if (match.isEmpty()) {
                log.info("zapi delivery sem correlação zaapId={}", key);
            }
        }

        if (instanceId != null && key != null
                && !events.existsByInstanceIdAndTipoAndZaapId(instanceId, "DeliveryCallback", key)) {
            events.save(new ZapiEvent(instanceId, "DeliveryCallback", key, phone, "out",
                    error != null ? "erro: " + error : "entregue", p));
        }
    }

    /** `DisconnectedCallback`/`ConnectedCallback` — reflete no lastCheck da integração. */
    @Transactional
    public void connection(Map<String, Object> p, boolean connected) {
        String instanceId = str(p.get("instanceId"));
        IntegrationSettings cfg = settings.findById(IntegrationSettings.ZAPI_WHATSAPP).orElse(null);
        if (cfg != null) {
            cfg.registrarCheck(connected, connected
                    ? "instância conectada ao WhatsApp"
                    : "instância desconectada — escaneie o QR novamente");
            settings.save(cfg);
        }
        if (instanceId != null) {
            events.save(new ZapiEvent(instanceId,
                    connected ? "ConnectedCallback" : "DisconnectedCallback",
                    null, null, "sys", connected ? "conectada" : "desconectada", p));
        }
        log.info("zapi conexão instance={} connected={}", instanceId, connected);
    }

    /** Extrai o texto de `ReceivedCallback` — text.message ou marcador de mídia. */
    private static String textoDe(Map<String, Object> p) {
        Object text = p.get("text");
        if (text instanceof Map<?, ?> m && m.get("message") instanceof String s && !s.isBlank()) {
            return s;
        }
        for (String k : new String[]{"image", "video", "audio", "document", "sticker", "location", "contact"}) {
            if (p.get(k) != null) return "[" + k + "]";
        }
        if (text instanceof String s && !s.isBlank()) return s;
        return "[mensagem]";
    }

    private static String str(Object v) {
        return v instanceof String s && !s.isBlank() ? s : null;
    }

    private static String mask(String phone) {
        if (phone == null || phone.length() < 4) return "***";
        return phone.substring(0, phone.length() - 4) + "****";
    }
}
