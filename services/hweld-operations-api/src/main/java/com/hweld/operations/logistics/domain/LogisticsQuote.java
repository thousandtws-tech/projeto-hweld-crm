package com.hweld.operations.logistics.domain;

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
 * Registro de uma cotação de frete executada (`logistics_quotes`).
 * Auditoria + histórico do painel; a compra de frete (fase B) referencia
 * a cotação que originou o envio.
 */
@Entity
@Table(name = "logistics_quotes")
public class LogisticsQuote {

    @Id
    private UUID id;

    @Column(nullable = false, length = 30)
    private String provider;

    @Column(name = "pedido_id")
    private Long pedidoId;

    @Column(name = "empresa_id")
    private Long empresaId;

    @Column(name = "cep_origem", nullable = false, length = 9)
    private String cepOrigem;

    @Column(name = "cep_destino", nullable = false, length = 9)
    private String cepDestino;

    @Column(nullable = false, length = 20)
    private String status;

    @Column(columnDefinition = "text")
    private String erro;

    @Column(name = "servicos_count", nullable = false)
    private int servicosCount;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "payload_request", nullable = false)
    private Map<String, Object> payloadRequest;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "payload_response")
    private Map<String, Object> payloadResponse;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected LogisticsQuote() {}

    public static LogisticsQuote registrar(String provider, Long pedidoId, Long empresaId,
            String cepOrigem, String cepDestino, Map<String, Object> request) {
        LogisticsQuote q = new LogisticsQuote();
        q.id = UUID.randomUUID();
        q.provider = provider;
        q.pedidoId = pedidoId;
        q.empresaId = empresaId;
        q.cepOrigem = cepOrigem;
        q.cepDestino = cepDestino;
        q.status = "OK";
        q.payloadRequest = request;
        return q;
    }

    public void concluir(Map<String, Object> response, int servicos) {
        this.status = "OK";
        this.payloadResponse = response;
        this.servicosCount = servicos;
        this.erro = null;
    }

    public void falhar(String erro) {
        this.status = "ERRO";
        this.erro = erro != null && erro.length() > 900 ? erro.substring(0, 900) : erro;
    }

    public UUID getId() { return id; }
    public String getProvider() { return provider; }
    public Long getPedidoId() { return pedidoId; }
    public Long getEmpresaId() { return empresaId; }
    public String getCepOrigem() { return cepOrigem; }
    public String getCepDestino() { return cepDestino; }
    public String getStatus() { return status; }
    public String getErro() { return erro; }
    public int getServicosCount() { return servicosCount; }
    public Map<String, Object> getPayloadRequest() { return payloadRequest; }
    public Map<String, Object> getPayloadResponse() { return payloadResponse; }
    public Instant getCreatedAt() { return createdAt; }
}
