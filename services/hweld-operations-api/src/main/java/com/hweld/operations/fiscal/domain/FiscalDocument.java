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
 * Orquestração da emissão fiscal junto a um provedor externo (NF-e/NFS-e).
 * O registro de negócio da NF permanece no core-api (`notas_fiscais`) —
 * aqui fica o tracking/protocolo do provedor. Regras tributárias ficam no
 * provedor: não há cálculo fictício de impostos.
 */
@Entity
@Table(name = "fiscal_documents")
public class FiscalDocument {

    public enum DocType { NFE, NFSE }

    public enum Status { REQUESTED, PROCESSING, AUTHORIZED, REJECTED, CANCELLED }

    @Id
    private UUID id;

    @Column(name = "pedido_id", nullable = false)
    private Long pedidoId;

    @Column(name = "empresa_id", nullable = false)
    private Long empresaId;

    @Column(name = "billing_invoice_id")
    private UUID billingInvoiceId;

    @Column(name = "nota_fiscal_id")
    private Long notaFiscalId;

    @Column(name = "doc_type", nullable = false, columnDefinition = "text")
    private String docType;

    @Column(nullable = false, length = 40)
    private String provider;

    @Column(nullable = false, columnDefinition = "text")
    private String status = Status.REQUESTED.name();

    @Column(name = "external_id", length = 160)
    private String externalId;

    @Column(name = "access_key", columnDefinition = "char(44)")
    private String accessKey;

    @Column(length = 60)
    private String protocol;

    @Column(name = "xml_url", length = 600)
    private String xmlUrl;

    @Column(name = "pdf_url", length = 600)
    private String pdfUrl;

    @Column(name = "rejection_reason", length = 500)
    private String rejectionReason;

    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, Object> payload;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected FiscalDocument() {}

    public FiscalDocument(Long pedidoId, Long empresaId, UUID billingInvoiceId,
            Long notaFiscalId, DocType docType, String provider) {
        this.id = UUID.randomUUID();
        this.pedidoId = pedidoId;
        this.empresaId = empresaId;
        this.billingInvoiceId = billingInvoiceId;
        this.notaFiscalId = notaFiscalId;
        this.docType = docType.name();
        this.provider = provider;
    }

    public void applyProviderResult(String externalId, Status status, String accessKey,
            String protocol, String xmlUrl, String pdfUrl, String rejectionReason,
            Map<String, Object> payload) {
        this.externalId = externalId;
        this.status = status.name();
        this.accessKey = accessKey;
        this.protocol = protocol;
        this.xmlUrl = xmlUrl;
        this.pdfUrl = pdfUrl;
        this.rejectionReason = rejectionReason;
        if (payload != null) this.payload = payload;
        this.updatedAt = Instant.now();
    }

    public void markCancelled() {
        if (!Status.AUTHORIZED.name().equals(status) && !Status.REQUESTED.name().equals(status)
                && !Status.PROCESSING.name().equals(status)) {
            throw new IllegalStateException("documento " + status + " não pode ser cancelado");
        }
        this.status = Status.CANCELLED.name();
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public Long getPedidoId() { return pedidoId; }
    public Long getEmpresaId() { return empresaId; }
    public UUID getBillingInvoiceId() { return billingInvoiceId; }
    public Long getNotaFiscalId() { return notaFiscalId; }
    public String getDocType() { return docType; }
    public String getProvider() { return provider; }
    public String getStatus() { return status; }
    public String getExternalId() { return externalId; }
    public String getAccessKey() { return accessKey; }
    public String getProtocol() { return protocol; }
    public String getXmlUrl() { return xmlUrl; }
    public String getPdfUrl() { return pdfUrl; }
    public String getRejectionReason() { return rejectionReason; }
    public Map<String, Object> getPayload() { return payload; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
