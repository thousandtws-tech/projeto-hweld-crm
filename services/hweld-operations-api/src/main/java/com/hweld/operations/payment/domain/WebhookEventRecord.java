package com.hweld.operations.payment.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Webhook recebido de um PSP — dedupe por (provider, event_id).
 * A linha é gravada antes do processamento: crash no meio vira replay seguro.
 */
@Entity
@Table(name = "payment_webhook_events")
public class WebhookEventRecord {

    @Id
    private UUID id;

    @Column(nullable = false, length = 40)
    private String provider;

    @Column(name = "event_id", nullable = false, length = 160)
    private String eventId;

    @Column(name = "signature_valid", nullable = false)
    private boolean signatureValid;

    @Column(name = "payment_id")
    private UUID paymentId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private Map<String, Object> payload;

    @Column(name = "processing_result", length = 40)
    private String processingResult;

    @Column(name = "error_message", length = 400)
    private String errorMessage;

    @Column(name = "received_at", nullable = false)
    private Instant receivedAt = Instant.now();

    @Column(name = "processed_at")
    private Instant processedAt;

    protected WebhookEventRecord() {}

    public WebhookEventRecord(String provider, String eventId, boolean signatureValid,
            Map<String, Object> payload) {
        this.id = UUID.randomUUID();
        this.provider = provider;
        this.eventId = eventId;
        this.signatureValid = signatureValid;
        this.payload = payload;
    }

    public void markProcessed(UUID paymentId, String result, String error) {
        this.paymentId = paymentId;
        this.processingResult = result;
        this.errorMessage = error == null ? null
                : error.substring(0, Math.min(error.length(), 400));
        this.processedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getPaymentId() { return paymentId; }
}
