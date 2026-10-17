package com.hweld.operations.payment.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Trilha imutável de eventos do pagamento (charge, webhook, refund, reconcile). */
@Entity
@Table(name = "payment_transactions")
public class PaymentTransaction {

    public enum Type {
        CHARGE_REQUESTED, CHARGE_CREATED, WEBHOOK, STATUS_CHANGE, REFUND, CANCEL, RECONCILE
    }

    @Id
    private UUID id;

    @Column(name = "payment_id", nullable = false)
    private UUID paymentId;

    @Column(nullable = false, columnDefinition = "text")
    private String type;

    @Column(name = "status_from", length = 20)
    private String statusFrom;

    @Column(name = "status_to", nullable = false, length = 20)
    private String statusTo;

    @Column(precision = 14, scale = 2)
    private BigDecimal amount;

    @Column(length = 3)
    private String currency;

    @Column(name = "external_id", length = 120)
    private String externalId;

    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, Object> payload;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt = Instant.now();

    protected PaymentTransaction() {}

    public PaymentTransaction(UUID paymentId, Type type, String statusFrom, String statusTo,
            BigDecimal amount, String currency, String externalId, Map<String, Object> payload) {
        this.id = UUID.randomUUID();
        this.paymentId = paymentId;
        this.type = type.name();
        this.statusFrom = statusFrom;
        this.statusTo = statusTo;
        this.amount = amount;
        this.currency = currency;
        this.externalId = externalId;
        this.payload = payload;
    }

    public UUID getId() { return id; }
    public UUID getPaymentId() { return paymentId; }
}
