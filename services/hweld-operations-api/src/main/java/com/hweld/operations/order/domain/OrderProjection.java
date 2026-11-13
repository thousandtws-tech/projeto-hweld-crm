package com.hweld.operations.order.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Projeção CQRS do pedido do core-api (Rust) — alimentada pelo evento
 * `OrderCreated` entregue via `/api/v1/internal/events` → outbox.
 * Read-model para joins/agregações sem chamar o serviço irmão; a fonte de
 * verdade do pedido permanece no Rust.
 */
@Entity
@Table(name = "order_projections")
public class OrderProjection {

    @Id
    @Column(name = "pedido_id")
    private Long pedidoId;

    @Column(name = "public_id")
    private UUID publicId;

    @Column(nullable = false, length = 32)
    private String numero;

    @Column(name = "empresa_id", nullable = false)
    private Long empresaId;

    @Column(name = "contato_id")
    private Long contatoId;

    @Column(nullable = false, precision = 14, scale = 2)
    private BigDecimal total;

    @Column(nullable = false, length = 40)
    private String status;

    @Column(nullable = false, length = 20)
    private String origem;

    @Column(name = "condicao_pagamento", length = 60)
    private String condicaoPagamento;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected OrderProjection() {}

    /**
     * Upsert idempotente — re-entrega do mesmo evento apenas atualiza o
     * snapshot (o relay já deduplica por eventId; isto cobre eventos
     * distintos para o mesmo pedido, ex.: OrderCreated + futuros updates).
     */
    public void sincronizar(UUID publicId, String numero, Long empresaId, Long contatoId,
            BigDecimal total, String status, String origem, String condicaoPagamento) {
        this.publicId = publicId;
        this.numero = numero;
        this.empresaId = empresaId;
        this.contatoId = contatoId;
        this.total = total;
        this.status = status;
        this.origem = origem;
        this.condicaoPagamento = condicaoPagamento;
        this.updatedAt = Instant.now();
    }

    public static OrderProjection criar(Long pedidoId) {
        OrderProjection p = new OrderProjection();
        p.pedidoId = pedidoId;
        return p;
    }

    public Long getPedidoId() { return pedidoId; }
    public UUID getPublicId() { return publicId; }
    public String getNumero() { return numero; }
    public Long getEmpresaId() { return empresaId; }
    public Long getContatoId() { return contatoId; }
    public BigDecimal getTotal() { return total; }
    public String getStatus() { return status; }
    public String getOrigem() { return origem; }
    public String getCondicaoPagamento() { return condicaoPagamento; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
