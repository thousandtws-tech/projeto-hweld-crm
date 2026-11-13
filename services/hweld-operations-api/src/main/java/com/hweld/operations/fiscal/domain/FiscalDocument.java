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
 *
 * Máquina de estados: `status` é o estado interno controlado; `providerStatus`
 * preserva o status bruto do provedor (ex.: `processando_autorizacao`) para
 * reconciliação e auditoria. `REQUIRES_RECONCILIATION` marca emissões cujo
 * POST teve resultado inconclusivo (timeout/5xx/transporte) — o documento
 * só sai daí pela consulta por referência, nunca por reenvio cego.
 */
@Entity
@Table(name = "fiscal_documents")
public class FiscalDocument {

    public enum DocType { NFE, NFSE }

    public enum Status {
        REQUESTED, PROCESSING, AUTHORIZED, REJECTED, CANCELLED,
        CANCELLATION_PENDING, REQUIRES_RECONCILIATION, ERROR
    }

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

    @Column(nullable = false, length = 20)
    private String environment = "homologacao";

    @Column(nullable = false, columnDefinition = "text")
    private String status = Status.REQUESTED.name();

    @Column(name = "provider_status", length = 60)
    private String providerStatus;

    @Column(name = "status_detail", length = 500)
    private String statusDetail;

    /** Referência única da emissão no provedor (`ref` na Focus NFe). */
    @Column(name = "external_id", length = 160)
    private String externalId;

    @Column(name = "access_key", columnDefinition = "char(44)")
    private String accessKey;

    @Column(length = 60)
    private String protocol;

    @Column(length = 20)
    private String numero;

    @Column(length = 10)
    private String serie;

    @Column(name = "xml_url", length = 600)
    private String xmlUrl;

    @Column(name = "pdf_url", length = 600)
    private String pdfUrl;

    @Column(name = "rejection_reason", length = 500)
    private String rejectionReason;

    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, Object> payload;

    @Column(name = "last_sync_at")
    private Instant lastSyncedAt;

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

    /**
     * Atribui ambiente e referência do provedor ANTES do POST de emissão —
     * crash depois do envio ainda reconcilia pela mesma referência.
     */
    public void assignProviderRef(String environment, String externalId) {
        this.environment = environment;
        this.externalId = externalId;
        this.updatedAt = Instant.now();
    }

    /**
     * Sincroniza com o resultado do provedor (emissão, consulta, webhook,
     * reconciliação). Campos de artefato/rejeição não-nulos sobrescrevem —
     * null preserva o valor já gravado (ex.: chaves do object storage).
     */
    public void applySync(Status status, String providerStatus, String statusDetail,
            String accessKey, String protocol, String numero, String serie,
            String xmlUrl, String pdfUrl, String rejectionReason,
            Map<String, Object> payload) {
        this.status = status.name();
        this.providerStatus = providerStatus;
        this.statusDetail = statusDetail;
        if (accessKey != null) this.accessKey = accessKey;
        if (protocol != null) this.protocol = protocol;
        if (numero != null) this.numero = numero;
        if (serie != null) this.serie = serie;
        if (xmlUrl != null) this.xmlUrl = xmlUrl;
        if (pdfUrl != null) this.pdfUrl = pdfUrl;
        this.rejectionReason = rejectionReason;
        if (payload != null) this.payload = payload;
        this.lastSyncedAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    /** Somente grava chaves de artefatos hospedados no object storage. */
    public void applyArtifacts(String xmlKey, String pdfKey) {
        if (xmlKey != null) this.xmlUrl = xmlKey;
        if (pdfKey != null) this.pdfUrl = pdfKey;
        this.updatedAt = Instant.now();
    }

    public void markCancellationPending() {
        if (!Status.AUTHORIZED.name().equals(status)) {
            throw new IllegalStateException(
                    "documento " + status + " não pode iniciar cancelamento");
        }
        this.status = Status.CANCELLATION_PENDING.name();
        this.updatedAt = Instant.now();
    }

    /** Emissão inconclusiva (timeout/5xx/transporte) — exige reconciliação. */
    public void markReconciliation(String providerStatus, String detail) {
        this.status = Status.REQUIRES_RECONCILIATION.name();
        this.providerStatus = providerStatus;
        this.statusDetail = detail;
        this.lastSyncedAt = Instant.now();
        this.updatedAt = Instant.now();
    }

    public boolean isTerminal() {
        return Status.AUTHORIZED.name().equals(status)
                || Status.REJECTED.name().equals(status)
                || Status.CANCELLED.name().equals(status);
    }

    public boolean cancelavel() {
        return Status.AUTHORIZED.name().equals(status);
    }

    public UUID getId() { return id; }
    public Long getPedidoId() { return pedidoId; }
    public Long getEmpresaId() { return empresaId; }
    public UUID getBillingInvoiceId() { return billingInvoiceId; }
    public Long getNotaFiscalId() { return notaFiscalId; }
    public String getDocType() { return docType; }
    public String getProvider() { return provider; }
    public String getEnvironment() { return environment; }
    public String getStatus() { return status; }
    public String getProviderStatus() { return providerStatus; }
    public String getStatusDetail() { return statusDetail; }
    public String getExternalId() { return externalId; }
    public String getAccessKey() { return accessKey; }
    public String getProtocol() { return protocol; }
    public String getNumero() { return numero; }
    public String getSerie() { return serie; }
    public String getXmlUrl() { return xmlUrl; }
    public String getPdfUrl() { return pdfUrl; }
    public String getRejectionReason() { return rejectionReason; }
    public Map<String, Object> getPayload() { return payload; }
    public Instant getLastSyncedAt() { return lastSyncedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
