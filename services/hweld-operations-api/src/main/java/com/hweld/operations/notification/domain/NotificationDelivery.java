package com.hweld.operations.notification.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Envio transacional (e-mail) — fila persistida com retry e histórico. */
@Entity
@Table(name = "notification_deliveries")
public class NotificationDelivery {

    public enum Status { QUEUED, SENDING, SENT, FAILED, DEAD }

    @Id
    private UUID id;

    @Column(name = "template_code", length = 60)
    private String templateCode;

    @Column(nullable = false, columnDefinition = "text")
    private String channel = "EMAIL";

    @Column(nullable = false, length = 200)
    private String recipient;

    @Column(nullable = false, length = 300)
    private String subject;

    @Column(nullable = false, columnDefinition = "text")
    private String status = Status.QUEUED.name();

    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, Object> payload;

    @Column(nullable = false)
    private int attempts = 0;

    @Column(name = "next_retry_at")
    private Instant nextRetryAt;

    @Column(name = "last_error", length = 500)
    private String lastError;

    @Column(name = "sent_at")
    private Instant sentAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    // corpo renderizado fica em payload.html/text — não duplicado em coluna

    protected NotificationDelivery() {}

    public NotificationDelivery(String templateCode, String recipient, String subject,
            Map<String, Object> payload) {
        this.id = UUID.randomUUID();
        this.templateCode = templateCode;
        this.recipient = recipient;
        this.subject = subject;
        this.payload = payload;
    }

    public void markSending() {
        this.status = Status.SENDING.name();
        this.attempts++;
    }

    public void markSent() {
        this.status = Status.SENT.name();
        this.sentAt = Instant.now();
        this.nextRetryAt = null;
        this.lastError = null;
    }

    public void markFailed(String error, Instant nextRetry) {
        this.status = Status.FAILED.name();
        this.lastError = error == null ? null : error.substring(0, Math.min(error.length(), 500));
        this.nextRetryAt = nextRetry;
    }

    public void markDead(String error) {
        this.status = Status.DEAD.name();
        this.lastError = error == null ? null : error.substring(0, Math.min(error.length(), 500));
    }

    public UUID getId() { return id; }
    public String getTemplateCode() { return templateCode; }
    public String getRecipient() { return recipient; }
    public String getSubject() { return subject; }
    public String getStatus() { return status; }
    public Map<String, Object> getPayload() { return payload; }
    public int getAttempts() { return attempts; }
    public Instant getNextRetryAt() { return nextRetryAt; }
    public Instant getSentAt() { return sentAt; }
}
