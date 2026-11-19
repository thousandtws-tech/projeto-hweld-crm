package com.hweld.operations.notification.application;

import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.notification.domain.NotificationDelivery;
import com.hweld.operations.notification.domain.NotificationDeliveryRepository;
import com.hweld.operations.notification.domain.NotificationTemplate;
import com.hweld.operations.notification.domain.NotificationTemplateRepository;
import com.hweld.operations.shared.application.EventTypes;
import com.hweld.operations.shared.application.IntegrationEvent;
import com.hweld.operations.shared.infrastructure.outbox.Outbox;
import com.hweld.operations.shared.interfaces.error.ApiException;
import com.hweld.operations.shared.interfaces.web.CorrelationIdFilter;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Fila transacional de notificações: enfileira (QUEUED) na TX do evento de
 * negócio, despacha assíncrono com retry exponencial limitado e DEAD ao fim.
 */
@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    @ConfigurationProperties(prefix = "hweld.notification")
    public record Props(String emailProvider, String smsProvider, int maxAttempts,
            long retryBaseDelayMs, long dlrReconcileAgeMs,
            String defaultFrom, String defaultFromName) {
        public Props {
            if (emailProvider == null) emailProvider = "log";
            if (smsProvider == null) smsProvider = "log";
            if (maxAttempts <= 0) maxAttempts = 4;
            if (retryBaseDelayMs <= 0) retryBaseDelayMs = 30000;
            if (dlrReconcileAgeMs <= 0) dlrReconcileAgeMs = 21_600_000; // 6h
        }
    }

    private final NotificationTemplateRepository templates;
    private final NotificationDeliveryRepository deliveries;
    private final IntegrationSettingsRepository integrations;
    private final TemplateRenderer renderer;
    private final EmailProvider emailProvider;
    private final SmsProvider smsProvider;
    private final com.hweld.operations.notification.infrastructure.zapi.ZapiWhatsAppProvider zapi;
    private final Outbox outbox;
    private final Props props;

    public NotificationService(NotificationTemplateRepository templates,
            NotificationDeliveryRepository deliveries,
            IntegrationSettingsRepository integrations, TemplateRenderer renderer,
            EmailProvider emailProvider, SmsProvider smsProvider,
            com.hweld.operations.notification.infrastructure.zapi.ZapiWhatsAppProvider zapi,
            Outbox outbox, Props props) {
        this.templates = templates;
        this.deliveries = deliveries;
        this.integrations = integrations;
        this.renderer = renderer;
        this.emailProvider = emailProvider;
        this.smsProvider = smsProvider;
        this.zapi = zapi;
        this.outbox = outbox;
        this.props = props;
    }

    /** Enfileira envio — chamado dentro da TX do evento de negócio. */
    @Transactional
    public NotificationDelivery queue(String templateCode, String recipient, Map<String, Object> vars) {
        if (recipient == null || recipient.isBlank()) {
            throw ApiException.validacao("destinatário ausente para template " + templateCode);
        }
        NotificationTemplate t = templates.findByCodeAndActiveTrue(templateCode)
                .orElseThrow(() -> ApiException.validacao("template inexistente/inativo: " + templateCode));
        String subject = renderer.render(t.getSubject(), vars, false);
        String html = renderer.render(t.getBodyHtml(), vars, true);
        String text = t.getBodyText() != null ? renderer.render(t.getBodyText(), vars, false) : null;

        Map<String, Object> payload = new java.util.HashMap<>(vars);
        payload.put("html", html);
        if (text != null) payload.put("text", text);

        NotificationDelivery d = new NotificationDelivery(templateCode, recipient, subject, payload);
        deliveries.save(d);
        return d;
    }

    /**
     * Enfileira SMS — `phoneRaw` é normalizado para E.164; inválido/ausente
     * vira SUPPRESSED auditável (não cobra nem tenta). `dedupKey` único
     * garante idempotência de re-entrega de evento/clique duplo; retorna a
     * entrega existente quando a chave já foi usada.
     */
    @Transactional
    public NotificationDelivery queueSms(String templateCode, String phoneRaw,
            Map<String, Object> vars, String dedupKey, String sourceEventId,
            Long pedidoId, int maxSegments) {
        NotificationTemplate t = templates.findByCodeAndActiveTrue(templateCode)
                .orElseThrow(() -> ApiException.validacao("template inexistente/inativo: " + templateCode));

        if (dedupKey != null) {
            var existente = deliveries.findByDedupKey(dedupKey);
            if (existente.isPresent()) return existente.get();
        }

        String e164 = PhoneNormalizer.toE164(phoneRaw);
        String text = renderer.render(
                t.getBodyText() != null ? t.getBodyText() : "", vars, false);

        Map<String, Object> payload = new java.util.HashMap<>(vars);
        payload.put("text", text);

        NotificationDelivery d = new NotificationDelivery(
                templateCode, e164 != null ? e164 : "(telefone inválido)", "SMS", payload)
                .asSms(dedupKey, sourceEventId, pedidoId);

        if (e164 == null) {
            d.markSuppressed("telefone ausente/inválido: " + mask(phoneRaw));
        } else {
            var count = SmsSegmenter.count(text);
            if (maxSegments > 0 && count.segments() > maxSegments) {
                d.markSuppressed("mensagem excede o máximo de " + maxSegments
                        + " segmentos (" + count.segments() + ")");
            } else {
                d.recordSegments(count.segments());
            }
        }
        deliveries.save(d);
        return d;
    }

    /**
     * SMS de texto livre (sem template) — usado pelo "Enviar SMS" de teste
     * do card de integração com mensagem customizada. Mesmo pipeline de
     * normalização/segmentos/supressão do `queueSms`.
     */
    @Transactional
    public NotificationDelivery queueSmsText(String phoneRaw, String text,
            String dedupKey, String sourceEventId, Long pedidoId, int maxSegments) {
        String e164 = PhoneNormalizer.toE164(phoneRaw);
        NotificationDelivery d = new NotificationDelivery(
                null, e164 != null ? e164 : "(telefone inválido)", "SMS",
                Map.of("text", text))
                .asSms(dedupKey, sourceEventId, pedidoId);
        if (e164 == null) {
            d.markSuppressed("telefone ausente/inválido: " + mask(phoneRaw));
        } else {
            var count = SmsSegmenter.count(text);
            if (maxSegments > 0 && count.segments() > maxSegments) {
                d.markSuppressed("mensagem excede o máximo de " + maxSegments
                        + " segmentos (" + count.segments() + ")");
            } else {
                d.recordSegments(count.segments());
            }
        }
        deliveries.save(d);
        return d;
    }

    /**
     * Enfileira WhatsApp via Z-API — texto de template sms_* reutilizado
     * (corpo puro). Sem segmentação: WhatsApp aceita texto longo nativo.
     */
    @Transactional
    public NotificationDelivery queueWhatsApp(String templateCode, String phoneRaw,
            Map<String, Object> vars, String dedupKey, String sourceEventId,
            Long pedidoId) {
        NotificationTemplate t = templates.findByCodeAndActiveTrue(templateCode)
                .orElseThrow(() -> ApiException.validacao("template inexistente/inativo: " + templateCode));
        if (dedupKey != null) {
            var existente = deliveries.findByDedupKey(dedupKey);
            if (existente.isPresent()) return existente.get();
        }
        String e164 = PhoneNormalizer.toE164(phoneRaw);
        String text = renderer.render(
                t.getBodyText() != null ? t.getBodyText() : "", vars, false);
        Map<String, Object> payload = new java.util.HashMap<>(vars);
        payload.put("text", text);
        NotificationDelivery d = new NotificationDelivery(
                templateCode, e164 != null ? e164 : "(telefone inválido)", "WhatsApp", payload)
                .asChannel("WHATSAPP", dedupKey, sourceEventId, pedidoId);
        if (e164 == null) {
            d.markSuppressed("telefone ausente/inválido: " + mask(phoneRaw));
        }
        deliveries.save(d);
        return d;
    }

    /** WhatsApp de texto livre — "Enviar mensagem de teste" do card Z-API. */
    @Transactional
    public NotificationDelivery queueWhatsAppText(String phoneRaw, String text,
            String dedupKey, String sourceEventId, Long pedidoId) {
        String e164 = PhoneNormalizer.toE164(phoneRaw);
        NotificationDelivery d = new NotificationDelivery(
                null, e164 != null ? e164 : "(telefone inválido)", "WhatsApp",
                Map.of("text", text))
                .asChannel("WHATSAPP", dedupKey, sourceEventId, pedidoId);
        if (e164 == null) {
            d.markSuppressed("telefone ausente/inválido: " + mask(phoneRaw));
        }
        deliveries.save(d);
        return d;
    }

    private static String mask(String phone) {
        if (phone == null || phone.length() < 4) return "***";
        return phone.substring(0, phone.length() - 4) + "****";
    }

    /** Dispatcher: despacha deliveries devidos. Falha → retry exponencial → DEAD. */
    @Scheduled(fixedDelayString = "${hweld.notification.dispatch-interval-ms:3000}", initialDelay = 4000)
    @Transactional
    public void dispatchDue() {
        List<NotificationDelivery> due = deliveries.findDispatchable(Instant.now(), 50);
        for (NotificationDelivery d : due) {
            send(d);
        }
    }

    /**
     * Reconciliação: SMS SENT sem DLR além de `dlr-reconcile-age-ms` vira
     * UNKNOWN — callback ausente nunca dispara reenvio automático.
     */
    @Scheduled(fixedDelayString = "${hweld.notification.dlr-reconcile-interval-ms:300000}",
            initialDelay = 60000)
    @Transactional
    public void reconcileSmsWithoutDlr() {
        Instant cutoff = Instant.now().minusMillis(props.dlrReconcileAgeMs());
        List<NotificationDelivery> pendentes = deliveries.findByChannelInAndStatusAndSentAtBefore(
                List.of("SMS", "WHATSAPP"), NotificationDelivery.Status.SENT.name(),
                cutoff, PageRequest.of(0, 100));
        for (NotificationDelivery d : pendentes) {
            d.markUnknown("sem DLR do provider há mais de " + props.dlrReconcileAgeMs() / 60000 + " min");
            deliveries.save(d);
        }
    }

    private void send(NotificationDelivery d) {
        if ("SMS".equals(d.getChannel())) {
            sendSms(d);
            return;
        }
        if ("WHATSAPP".equals(d.getChannel())) {
            sendWhatsApp(d);
            return;
        }
        d.markSending();
        try {
            String html = d.getPayload() != null ? (String) d.getPayload().get("html") : null;
            String text = d.getPayload() != null ? (String) d.getPayload().get("text") : null;
            emailProvider.send(d.getRecipient(), d.getSubject(), html, text);
            d.markSent();
            deliveries.save(d);
            outbox.publish("notification_delivery", d.getId().toString(), IntegrationEvent.of(
                    EventTypes.NOTIFICATION_SENT, d.getId().toString(),
                    Map.of("deliveryId", d.getId().toString(), "channel", "EMAIL"),
                    CorrelationIdFilter.current()));
        } catch (Exception e) {
            log.warn("email falhou delivery={} tentativa={}: {}", d.getId(), d.getAttempts(), e.getMessage());
            if (d.getAttempts() >= props.maxAttempts()) {
                d.markDead(e.getMessage());
                outbox.publish("notification_delivery", d.getId().toString(), IntegrationEvent.of(
                        EventTypes.NOTIFICATION_FAILED, d.getId().toString(),
                        Map.of("deliveryId", d.getId().toString(),
                                "lastError", String.valueOf(e.getMessage())),
                        CorrelationIdFilter.current()));
            } else {
                d.markFailed(e.getMessage(), nextRetry(d.getAttempts()));
            }
            deliveries.save(d);
        }
    }

    private void sendSms(NotificationDelivery d) {
        // Envio pausado na integração: aguarda na fila sem gastar tentativa.
        var cfg = integrations.findById(IntegrationSettings.INFOBIP_SMS).orElse(null);
        if (cfg != null && cfg.isEnvioPausado()) {
            d.defer(Instant.now().plus(Duration.ofMinutes(5)));
            deliveries.save(d);
            return;
        }
        d.markSending();
        try {
            String text = d.getPayload() != null ? (String) d.getPayload().get("text") : null;
            SmsProvider.SmsReceipt receipt = smsProvider.send(d.getRecipient(), text);
            d.applySmsReceipt(receipt.messageId(), receipt.bulkId(), receipt.segments());
            deliveries.save(d);
            outbox.publish("notification_delivery", d.getId().toString(), IntegrationEvent.of(
                    EventTypes.NOTIFICATION_SENT, d.getId().toString(),
                    Map.of("deliveryId", d.getId().toString(), "channel", "SMS"),
                    CorrelationIdFilter.current()));
        } catch (SmsSendException e) {
            log.warn("sms falhou delivery={} tentativa={} kind={}: {}",
                    d.getId(), d.getAttempts(), e.kind(), e.getMessage());
            if (!e.isRetryable() || d.getAttempts() >= props.maxAttempts()) {
                d.markDead(e.kind() + ": " + e.getMessage());
                outbox.publish("notification_delivery", d.getId().toString(), IntegrationEvent.of(
                        EventTypes.NOTIFICATION_FAILED, d.getId().toString(),
                        Map.of("deliveryId", d.getId().toString(), "channel", "SMS",
                                "lastError", String.valueOf(e.getMessage())),
                        CorrelationIdFilter.current()));
            } else {
                Instant retry = e.retryAfterMs() != null
                        ? Instant.now().plusMillis(e.retryAfterMs())
                        : nextRetry(d.getAttempts());
                d.markFailed(e.getMessage(), retry);
            }
            deliveries.save(d);
        } catch (Exception e) {
            // Falha fora do contrato tipado — tratada como transitória.
            log.warn("sms falhou inesperada delivery={} tentativa={}: {}",
                    d.getId(), d.getAttempts(), e.getMessage());
            if (d.getAttempts() >= props.maxAttempts()) {
                d.markDead(e.getMessage());
            } else {
                d.markFailed(e.getMessage(), nextRetry(d.getAttempts()));
            }
            deliveries.save(d);
        }
    }

    private void sendWhatsApp(NotificationDelivery d) {
        var cfg = integrations.findById(IntegrationSettings.ZAPI_WHATSAPP).orElse(null);
        if (cfg != null && cfg.isEnvioPausado()) {
            d.defer(Instant.now().plus(Duration.ofMinutes(5)));
            deliveries.save(d);
            return;
        }
        d.markSending();
        try {
            String text = d.getPayload() != null ? (String) d.getPayload().get("text") : null;
            SmsProvider.SmsReceipt receipt = zapi.send(d.getRecipient(), text);
            d.applySmsReceipt(receipt.messageId(), receipt.bulkId(), receipt.segments());
            deliveries.save(d);
            outbox.publish("notification_delivery", d.getId().toString(), IntegrationEvent.of(
                    EventTypes.NOTIFICATION_SENT, d.getId().toString(),
                    Map.of("deliveryId", d.getId().toString(), "channel", "WHATSAPP"),
                    CorrelationIdFilter.current()));
        } catch (SmsSendException e) {
            log.warn("whatsapp falhou delivery={} tentativa={} kind={}: {}",
                    d.getId(), d.getAttempts(), e.kind(), e.getMessage());
            if (!e.isRetryable() || d.getAttempts() >= props.maxAttempts()) {
                d.markDead(e.kind() + ": " + e.getMessage());
                outbox.publish("notification_delivery", d.getId().toString(), IntegrationEvent.of(
                        EventTypes.NOTIFICATION_FAILED, d.getId().toString(),
                        Map.of("deliveryId", d.getId().toString(), "channel", "WHATSAPP",
                                "lastError", String.valueOf(e.getMessage())),
                        CorrelationIdFilter.current()));
            } else {
                Instant retry = e.retryAfterMs() != null
                        ? Instant.now().plusMillis(e.retryAfterMs())
                        : nextRetry(d.getAttempts());
                d.markFailed(e.getMessage(), retry);
            }
            deliveries.save(d);
        } catch (Exception e) {
            log.warn("whatsapp falhou inesperada delivery={} tentativa={}: {}",
                    d.getId(), d.getAttempts(), e.getMessage());
            if (d.getAttempts() >= props.maxAttempts()) {
                d.markDead(e.getMessage());
            } else {
                d.markFailed(e.getMessage(), nextRetry(d.getAttempts()));
            }
            deliveries.save(d);
        }
    }

    private Instant nextRetry(int attempt) {
        long base = props.retryBaseDelayMs() * (1L << Math.min(attempt - 1, 6));
        long jitter = ThreadLocalRandom.current().nextLong(base / 4 + 1);
        return Instant.now().plusMillis(Math.min(base + jitter, Duration.ofMinutes(30).toMillis()));
    }

    @Transactional(readOnly = true)
    public Page<NotificationDelivery> list(String status, String recipient,
            String channel, Long pedidoId, Pageable pageable) {
        if ("SMS".equalsIgnoreCase(channel) || "WHATSAPP".equalsIgnoreCase(channel)) {
            String ch = channel.toUpperCase();
            if (status != null) return deliveries.findByChannelAndStatusOrderByCreatedAtDesc(
                    ch, status.toUpperCase(), pageable);
            if (pedidoId != null) return deliveries.findByChannelAndPedidoIdOrderByCreatedAtDesc(
                    ch, pedidoId, pageable);
            return deliveries.findByChannelOrderByCreatedAtDesc(ch, pageable);
        }
        if (recipient != null) return deliveries.findByRecipientOrderByCreatedAtDesc(recipient, pageable);
        if (status != null) return deliveries.findByStatusOrderByCreatedAtDesc(status.toUpperCase(), pageable);
        return deliveries.findAll(pageable);
    }

    @Transactional(readOnly = true)
    public NotificationDelivery get(UUID id) {
        return deliveries.findById(id)
                .orElseThrow(() -> ApiException.naoEncontrado("delivery não encontrado"));
    }

    /**
     * Reprocessa um delivery manualmente (admin). UNKNOWN é permitido
     * explicitamente — o chamador reconhece que o envio pode já ter ocorrido
     * (timeout ambíguo) e assume a possibilidade de duplicidade.
     */
    @Transactional
    public void retry(UUID id) {
        NotificationDelivery d = get(id);
        if (d.getStatus().equals(NotificationDelivery.Status.SENT.name())
                || d.getStatus().equals(NotificationDelivery.Status.DELIVERED.name())
                || d.getStatus().equals(NotificationDelivery.Status.ACCEPTED.name())) {
            throw ApiException.conflito("delivery já enviado — reprocessar não é seguro");
        }
        d.markFailed(null, Instant.now()); // volta para fila
        deliveries.save(d);
    }
}
