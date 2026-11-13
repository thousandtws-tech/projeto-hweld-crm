package com.hweld.operations.notification.application;

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
    public record Props(String emailProvider, int maxAttempts, long retryBaseDelayMs,
            String defaultFrom, String defaultFromName) {
        public Props {
            if (emailProvider == null) emailProvider = "log";
            if (maxAttempts <= 0) maxAttempts = 4;
            if (retryBaseDelayMs <= 0) retryBaseDelayMs = 30000;
        }
    }

    private final NotificationTemplateRepository templates;
    private final NotificationDeliveryRepository deliveries;
    private final TemplateRenderer renderer;
    private final EmailProvider emailProvider;
    private final Outbox outbox;
    private final Props props;

    public NotificationService(NotificationTemplateRepository templates,
            NotificationDeliveryRepository deliveries, TemplateRenderer renderer,
            EmailProvider emailProvider, Outbox outbox, Props props) {
        this.templates = templates;
        this.deliveries = deliveries;
        this.renderer = renderer;
        this.emailProvider = emailProvider;
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

    /** Dispatcher: despacha deliveries devidos. Falha → retry exponencial → DEAD. */
    @Scheduled(fixedDelayString = "${hweld.notification.dispatch-interval-ms:3000}", initialDelay = 4000)
    @Transactional
    public void dispatchDue() {
        List<NotificationDelivery> due = deliveries.findDispatchable(Instant.now(), PageRequest.of(0, 50));
        for (NotificationDelivery d : due) {
            send(d);
        }
    }

    private void send(NotificationDelivery d) {
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

    private Instant nextRetry(int attempt) {
        long base = props.retryBaseDelayMs() * (1L << Math.min(attempt - 1, 6));
        long jitter = ThreadLocalRandom.current().nextLong(base / 4 + 1);
        return Instant.now().plusMillis(Math.min(base + jitter, Duration.ofMinutes(30).toMillis()));
    }

    @Transactional(readOnly = true)
    public Page<NotificationDelivery> list(String status, String recipient, Pageable pageable) {
        if (recipient != null) return deliveries.findByRecipientOrderByCreatedAtDesc(recipient, pageable);
        if (status != null) return deliveries.findByStatusOrderByCreatedAtDesc(status.toUpperCase(), pageable);
        return deliveries.findAll(pageable);
    }

    @Transactional(readOnly = true)
    public NotificationDelivery get(UUID id) {
        return deliveries.findById(id)
                .orElseThrow(() -> ApiException.naoEncontrado("delivery não encontrado"));
    }

    /** Reprocessa um delivery FAILED/DEAD manualmente (admin). */
    @Transactional
    public void retry(UUID id) {
        NotificationDelivery d = get(id);
        if (d.getStatus().equals(NotificationDelivery.Status.SENT.name())) {
            throw ApiException.conflito("delivery já enviado");
        }
        d.markFailed(null, Instant.now()); // volta para fila
        deliveries.save(d);
    }
}
