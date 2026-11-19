package com.hweld.operations.notification.domain;

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
 * Evento recebido de webhook Z-API — mensagens inbound, callbacks de
 * entrega e mudanças de conexão. Dedup por (instance_id, tipo, zaap_id).
 */
@Entity
@Table(name = "zapi_events")
public class ZapiEvent {

    @Id
    private UUID id = UUID.randomUUID();

    @Column(name = "instance_id", nullable = false, length = 80)
    private String instanceId;

    @Column(nullable = false, length = 40)
    private String tipo;

    @Column(name = "zaap_id", length = 80)
    private String zaapId;

    @Column(length = 40)
    private String phone;

    @Column(nullable = false, length = 10)
    private String direction = "in";

    @Column(columnDefinition = "text")
    private String conteudo;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> payload;

    @Column(name = "recebido_em", nullable = false)
    private Instant recebidoEm = Instant.now();

    protected ZapiEvent() {}

    public ZapiEvent(String instanceId, String tipo, String zaapId, String phone,
            String direction, String conteudo, Map<String, Object> payload) {
        this.instanceId = instanceId;
        this.tipo = tipo;
        this.zaapId = zaapId;
        this.phone = phone;
        this.direction = direction;
        this.conteudo = conteudo;
        this.payload = payload;
    }

    public UUID getId() { return id; }
    public String getInstanceId() { return instanceId; }
    public String getTipo() { return tipo; }
    public String getZaapId() { return zaapId; }
    public String getPhone() { return phone; }
    public String getDirection() { return direction; }
    public String getConteudo() { return conteudo; }
    public Map<String, Object> getPayload() { return payload; }
    public Instant getRecebidoEm() { return recebidoEm; }
}
