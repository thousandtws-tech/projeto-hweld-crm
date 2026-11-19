package com.hweld.operations.payment.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Transação de pagamento junto a um PSP. Referências ao domínio do Rust
 * (`pedido_id`, `empresa_id`, `contato_id`) são colunas simples — sem FK
 * cruzada entre serviços.
 */
@Entity
@Table(name = "payments")
public class Payment {

    @Id
    private UUID id;

    @Column(name = "pedido_id", nullable = false)
    private Long pedidoId;

    @Column(name = "empresa_id", nullable = false)
    private Long empresaId;

    @Column(name = "contato_id")
    private Long contatoId;

    @Column(name = "contato_email", length = 320)
    private String contatoEmail;

    /** Telefone do contato, capturado na criação — alimenta o canal SMS. */
    @Column(name = "contato_telefone", length = 20)
    private String contatoTelefone;

    /** Número do pedido (PV-XXXXXX), denormalizado na criação — eventos de
     *  transição não voltam ao core-api, então o número viaja junto. */
    @Column(name = "pedido_numero", length = 40)
    private String pedidoNumero;

    @Column(nullable = false, length = 40)
    private String provider;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "text")
    private PaymentMethod method;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "text")
    private PaymentStatus status = PaymentStatus.PENDING;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false, length = 3)
    private String currency = "BRL";

    @Column(name = "idempotency_key", nullable = false, length = 120)
    private String idempotencyKey;

    @Column(name = "external_id", length = 120)
    private String externalId;

    @Column(name = "checkout_url", length = 600)
    private String checkoutUrl;

    @Column(name = "pix_qr_code", columnDefinition = "text")
    private String pixQrCode;

    @Column(name = "pix_copy_paste", columnDefinition = "text")
    private String pixCopyPaste;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "failure_code", length = 60)
    private String failureCode;

    @Column(name = "failure_message", length = 400)
    private String failureMessage;

    @Column(name = "created_by_type", nullable = false, length = 10)
    private String createdByType;

    @Column(name = "created_by_id", nullable = false, length = 80)
    private String createdById;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Version
    private long version;

    protected Payment() {}

    public Payment(UUID id, Long pedidoId, Long empresaId, Long contatoId, String provider,
            PaymentMethod method, BigDecimal amount, String idempotencyKey,
            String createdByType, String createdById) {
        this.id = id;
        this.pedidoId = pedidoId;
        this.empresaId = empresaId;
        this.contatoId = contatoId;
        this.provider = provider;
        this.method = method;
        this.amount = amount;
        this.idempotencyKey = idempotencyKey;
        this.createdByType = createdByType;
        this.createdById = createdById;
    }

    /** Número do pedido, capturado na criação para eventos/notificações. */
    public void assignPedidoNumero(String numero) {
        if (numero != null && !numero.isBlank()) {
            this.pedidoNumero = numero.substring(0, Math.min(numero.length(), 40));
        }
    }

    /** E-mail do contato, capturado na criação para notificações assíncronas. */
    public void assignContatoEmail(String email) {
        if (email != null && !email.isBlank()) {
            this.contatoEmail = email.substring(0, Math.min(email.length(), 320));
        }
    }

    /** Telefone do contato (E.164 ou local), capturado na criação para SMS. */
    public void assignContatoTelefone(String telefone) {
        if (telefone != null && !telefone.isBlank()) {
            this.contatoTelefone = telefone.substring(0, Math.min(telefone.length(), 20));
        }
    }

    /** Transição de estado com guarda — violação é erro de domínio. */
    public void transitionTo(PaymentStatus next, String failureCode, String failureMessage) {
        if (!status.canTransitionTo(next)) {
            throw new IllegalStateException(
                    "transição inválida de pagamento: " + status + " → " + next);
        }
        this.status = next;
        this.failureCode = failureCode;
        this.failureMessage = failureMessage == null ? null
                : failureMessage.substring(0, Math.min(failureMessage.length(), 400));
        this.updatedAt = Instant.now();
    }

    /**
     * Adota o identificador canônico da transação no PSP. Fluxos hospedados
     * (checkout) nascem com o id do link e só recebem o id da cobrança real
     * no primeiro evento transacional — o relink faz cancel/estorno/
     * reconciliação operarem sobre a cobrança certa dali em diante.
     */
    public void relinkExternalId(String canonicalId) {
        if (canonicalId != null && !canonicalId.isBlank() && !canonicalId.equals(this.externalId)) {
            this.externalId = canonicalId.substring(0, Math.min(canonicalId.length(), 120));
            this.updatedAt = Instant.now();
        }
    }

    public void applyProviderResult(String externalId, String checkoutUrl,
            String pixQrCode, String pixCopyPaste, Instant expiresAt) {
        this.externalId = externalId;
        this.checkoutUrl = checkoutUrl;
        this.pixQrCode = pixQrCode;
        this.pixCopyPaste = pixCopyPaste;
        this.expiresAt = expiresAt;
        this.updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public Long getPedidoId() { return pedidoId; }
    public Long getEmpresaId() { return empresaId; }
    public Long getContatoId() { return contatoId; }
    public String getContatoEmail() { return contatoEmail; }
    public String getContatoTelefone() { return contatoTelefone; }
    public String getPedidoNumero() { return pedidoNumero; }
    public String getProvider() { return provider; }
    public PaymentMethod getMethod() { return method; }
    public PaymentStatus getStatus() { return status; }
    public BigDecimal getAmount() { return amount; }
    public String getCurrency() { return currency; }
    public String getIdempotencyKey() { return idempotencyKey; }
    public String getExternalId() { return externalId; }
    public String getCheckoutUrl() { return checkoutUrl; }
    public String getPixQrCode() { return pixQrCode; }
    public String getPixCopyPaste() { return pixCopyPaste; }
    public Instant getExpiresAt() { return expiresAt; }
    public String getFailureCode() { return failureCode; }
    public String getFailureMessage() { return failureMessage; }
    public String getCreatedByType() { return createdByType; }
    public String getCreatedById() { return createdById; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
