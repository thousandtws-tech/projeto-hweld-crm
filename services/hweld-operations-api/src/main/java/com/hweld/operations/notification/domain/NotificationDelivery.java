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

/** Envio transacional (e-mail/SMS) — fila persistida com retry e histórico. */
@Entity
@Table(name = "notification_deliveries")
public class NotificationDelivery {

    // ACCEPTED/DELIVERED/EXPIRED/SUPPRESSED/UNKNOWN: estados do ciclo SMS
    // (DLR Infobip). E-mail usa QUEUED→SENDING→SENT|FAILED|DEAD como antes.
    public enum Status { QUEUED, SENDING, SENT, ACCEPTED, DELIVERED, FAILED,
        EXPIRED, SUPPRESSED, UNKNOWN, DEAD }

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

    // ── SMS: correlação provider, idempotência e DLR ──────────────────────
    @Column(name = "dedup_key", length = 190)
    private String dedupKey;

    @Column(name = "message_id", length = 80)
    private String messageId;

    @Column(name = "bulk_id", length = 80)
    private String bulkId;

    private Integer segments;

    @Column(name = "remote_status", length = 120)
    private String remoteStatus;

    @Column(name = "delivered_at")
    private Instant deliveredAt;

    @Column(name = "source_event_id", length = 80)
    private String sourceEventId;

    @Column(name = "pedido_id")
    private Long pedidoId;

    /** Histórico de relatórios DLR recebidos (array JSONB, preserva ordem). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private java.util.List<java.util.Map<String, Object>> dlr;

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

    /** Canal SMS + rastreabilidade (dedup por evento/origem, pedido). */
    public NotificationDelivery asSms(String dedupKey, String sourceEventId, Long pedidoId) {
        this.channel = "SMS";
        this.dedupKey = dedupKey;
        this.sourceEventId = sourceEventId;
        this.pedidoId = pedidoId;
        return this;
    }

    /** Segmentos calculados no enqueue — visível antes do envio. */
    public void recordSegments(int segments) {
        this.segments = segments;
    }

    /** Provider aceitou — guarda correlação para o DLR casar depois. */
    public void applySmsReceipt(String messageId, String bulkId, Integer segments) {
        this.messageId = messageId;
        this.bulkId = bulkId;
        this.segments = segments;
        this.status = Status.SENT.name();
        this.sentAt = Instant.now();
        this.nextRetryAt = null;
        this.lastError = null;
    }

    /**
     * DLR monotônico: DELIVERED é terminal — relatórios tardios/fora de
     * ordem nunca rebaixam um estado final confirmado.
     */
    public void applyDlr(Status next, String remoteStatus, Map<String, Object> report) {
        if (Status.DELIVERED.name().equals(this.status)) {
            appendDlr(report);
            return;
        }
        this.remoteStatus = remoteStatus == null ? this.remoteStatus
                : remoteStatus.substring(0, Math.min(remoteStatus.length(), 120));
        appendDlr(report);
        if (next == Status.DELIVERED) {
            this.status = Status.DELIVERED.name();
            this.deliveredAt = Instant.now();
            this.nextRetryAt = null;
            this.lastError = null;
        } else if (next == Status.EXPIRED) {
            this.status = Status.EXPIRED.name();
            this.nextRetryAt = null;
        } else if (next == Status.FAILED) {
            this.status = Status.FAILED.name();
            this.nextRetryAt = null;
        } else if (next == Status.ACCEPTED
                && (Status.SENT.name().equals(this.status)
                        || Status.QUEUED.name().equals(this.status))) {
            this.status = Status.ACCEPTED.name();
        } else {
            this.status = Status.UNKNOWN.name();
        }
    }

    /** Provider não confirmou (timeout ambíguo / sem callback) — reconciliável. */
    public void markUnknown(String reason) {
        this.status = Status.UNKNOWN.name();
        this.lastError = reason == null ? null
                : reason.substring(0, Math.min(reason.length(), 500));
    }

    /** Evento posterior tornou o SMS obsoleto — não envia nem cobra. */
    public void markSuppressed(String reason) {
        this.status = Status.SUPPRESSED.name();
        this.lastError = reason == null ? null
                : reason.substring(0, Math.min(reason.length(), 500));
        this.nextRetryAt = null;
    }

    private void appendDlr(Map<String, Object> report) {
        if (report == null) return;
        if (this.dlr == null) {
            this.dlr = new java.util.ArrayList<>();
        }
        this.dlr.add(report);
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

    /** Adia sem consumir tentativa — canal pausado aguarda na fila. */
    public void defer(Instant nextAttempt) {
        this.status = Status.QUEUED.name();
        this.nextRetryAt = nextAttempt;
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
    public String getChannel() { return channel; }
    public String getDedupKey() { return dedupKey; }
    public String getMessageId() { return messageId; }
    public String getBulkId() { return bulkId; }
    public Integer getSegments() { return segments; }
    public String getRemoteStatus() { return remoteStatus; }
    public Instant getDeliveredAt() { return deliveredAt; }
    public Long getPedidoId() { return pedidoId; }
    public java.util.List<java.util.Map<String, Object>> getDlr() { return dlr; }
    public String getLastError() { return lastError; }
}
