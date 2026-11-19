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

@Entity
@Table(name = "fiscal_document_events")
public class FiscalDocumentEvent {

    public enum Type { REQUESTED, SUBMITTED, STATUS_CHANGE, WEBHOOK, RECONCILE, CANCEL, ERROR, ARTIFACT }

    @Id
    private UUID id;

    @Column(name = "fiscal_document_id", nullable = false)
    private UUID fiscalDocumentId;

    @Column(name = "event_type", nullable = false, columnDefinition = "text")
    private String eventType;

    @Column(name = "status_from", length = 40)
    private String statusFrom;

    @Column(name = "status_to", length = 40)
    private String statusTo;

    @Column(name = "provider_status", length = 60)
    private String providerStatus;

    @Column(length = 500)
    private String message;

    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, Object> payload;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected FiscalDocumentEvent() {}

    public FiscalDocumentEvent(UUID fiscalDocumentId, Type type, String statusFrom,
            String statusTo, String providerStatus, String message,
            Map<String, Object> payload) {
        this.id = UUID.randomUUID();
        this.fiscalDocumentId = fiscalDocumentId;
        this.eventType = type.name();
        this.statusFrom = statusFrom;
        this.statusTo = statusTo;
        this.providerStatus = providerStatus;
        this.message = message == null ? null
                : message.substring(0, Math.min(message.length(), 500));
        this.payload = payload;
    }

    public UUID getId() { return id; }
    public UUID getFiscalDocumentId() { return fiscalDocumentId; }
    public String getEventType() { return eventType; }
    public String getStatusFrom() { return statusFrom; }
    public String getStatusTo() { return statusTo; }
    public String getProviderStatus() { return providerStatus; }
    public String getMessage() { return message; }
    public Map<String, Object> getPayload() { return payload; }
    public Instant getCreatedAt() { return createdAt; }
}
