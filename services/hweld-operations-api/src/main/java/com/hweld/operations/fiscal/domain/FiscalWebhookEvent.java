package com.hweld.operations.fiscal.domain;

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
 * Webhook fiscal recebido (ex.: Spedy). Dedupe por (provider, event_key):
 * a linha é gravada em TX isolada antes do processamento — violação do UNIQUE
 * = entrega duplicada; crash depois do insert = replay seguro.
 */
@Entity
@Table(name = "fiscal_webhook_events")
public class FiscalWebhookEvent {

    @Id
    private UUID id;

    @Column(nullable = false, length = 40)
    private String provider;

    @Column(name = "event_key", nullable = false, length = 200)
    private String eventKey;

    @Column(name = "fiscal_document_id")
    private UUID fiscalDocumentId;

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

    protected FiscalWebhookEvent() {}

    public FiscalWebhookEvent(String provider, String eventKey, Map<String, Object> payload) {
        this.id = UUID.randomUUID();
        this.provider = provider;
        this.eventKey = eventKey;
        this.payload = payload;
    }

    public void markProcessed(UUID fiscalDocumentId, String result, String error) {
        this.fiscalDocumentId = fiscalDocumentId;
        this.processingResult = result;
        this.errorMessage = error == null ? null
                : error.substring(0, Math.min(error.length(), 400));
        this.processedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public String getEventKey() { return eventKey; }
    public UUID getFiscalDocumentId() { return fiscalDocumentId; }
    public String getProcessingResult() { return processingResult; }
    public String getErrorMessage() { return errorMessage; }
    public Instant getReceivedAt() { return receivedAt; }
}
