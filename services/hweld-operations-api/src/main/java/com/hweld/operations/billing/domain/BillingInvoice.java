package com.hweld.operations.billing.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * Fatura/cobrança (conta a receber) gerada de um pedido. O pagamento em si
 * vive em `payments`; esta é a visão financeira (vencimento, status, baixa).
 */
@Entity
@Table(name = "billing_invoices")
public class BillingInvoice {

    public enum Status { OPEN, PAID, OVERDUE, CANCELLED }

    @Id
    private UUID id;

    @Column(name = "payment_id")
    private UUID paymentId;

    @Column(name = "pedido_id", nullable = false)
    private Long pedidoId;

    @Column(name = "empresa_id", nullable = false)
    private Long empresaId;

    @Column(nullable = false, columnDefinition = "text")
    private String status = "OPEN";

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false, length = 3)
    private String currency = "BRL";

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(length = 300)
    private String description;

    @Column(name = "paid_at")
    private Instant paidAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected BillingInvoice() {}

    public BillingInvoice(UUID paymentId, Long pedidoId, Long empresaId,
            BigDecimal amount, String currency, LocalDate dueDate, String description) {
        this.id = UUID.randomUUID();
        this.paymentId = paymentId;
        this.pedidoId = pedidoId;
        this.empresaId = empresaId;
        this.amount = amount;
        this.currency = currency;
        this.dueDate = dueDate;
        this.description = description;
    }

    public Status status() { return Status.valueOf(status); }

    public void markPaid(Instant when) {
        if (status().ordinal() > Status.OVERDUE.ordinal()) {
            throw new IllegalStateException("fatura " + status + " não pode ser baixada");
        }
        this.status = Status.PAID.name();
        this.paidAt = when;
        this.updatedAt = Instant.now();
    }

    public void markOverdue() {
        if (status() == Status.OPEN) {
            this.status = Status.OVERDUE.name();
            this.updatedAt = Instant.now();
        }
    }

    public void cancel() {
        if (status() == Status.PAID) {
            throw new IllegalStateException("fatura paga não pode ser cancelada — use estorno");
        }
        this.status = Status.CANCELLED.name();
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getPaymentId() { return paymentId; }
    public Long getPedidoId() { return pedidoId; }
    public Long getEmpresaId() { return empresaId; }
    public String getStatus() { return status; }
    public BigDecimal getAmount() { return amount; }
    public String getCurrency() { return currency; }
    public LocalDate getDueDate() { return dueDate; }
    public String getDescription() { return description; }
    public Instant getPaidAt() { return paidAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
