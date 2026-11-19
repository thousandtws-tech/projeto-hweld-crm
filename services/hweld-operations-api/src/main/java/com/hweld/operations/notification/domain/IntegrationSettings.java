package com.hweld.operations.notification.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Toggles operacionais de uma integração (`integration_settings`). Segredos
 * NUNCA aqui — credenciais vêm de env (`INFOBIP_*`), padrão FocusNFe. Guarda
 * apenas o que muda em runtime: ativação, remetente, limites, destinatários
 * de teste e gatilhos por evento.
 */
@Entity
@Table(name = "integration_settings")
public class IntegrationSettings {

    public static final String INFOBIP_SMS = "infobip-sms";

    @Id
    @Column(length = 40)
    private String code;

    @Column(nullable = false)
    private boolean enabled = false;

    /** Remetente autorizado no painel Infobip (alfa ou E.164). */
    @Column(length = 32)
    private String sender;

    @Column(name = "max_segments", nullable = false)
    private int maxSegments = 3;

    /** Destinatários E.164 permitidos no "Enviar SMS de teste". */
    @JdbcTypeCode(SqlTypes.JSON)
    private List<String> testRecipients = List.of();

    /** eventType → boolean — gatilhos SMS por evento (nascem desligados). */
    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, Boolean> events = Map.of();

    /** Resultado do último "Testar conexão" — {at, ok, detail}. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "last_check")
    private Map<String, Object> lastCheck;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "updated_by", length = 120)
    private String updatedBy;

    protected IntegrationSettings() {}

    /** Nova integração nasce desativada — opt-in explícito do admin. */
    public static IntegrationSettings criar(String code) {
        IntegrationSettings s = new IntegrationSettings();
        s.code = code;
        return s;
    }

    public boolean isEventEnabled(String eventType) {
        return enabled && Boolean.TRUE.equals(events.get(eventType));
    }

    public boolean isTestRecipientAllowed(String e164) {
        return testRecipients != null && testRecipients.contains(e164);
    }

    public void atualizar(boolean enabled, String sender, int maxSegments,
            List<String> testRecipients, Map<String, Boolean> events, String updatedBy) {
        this.enabled = enabled;
        this.sender = sender == null || sender.isBlank() ? null : sender.trim();
        this.maxSegments = Math.max(1, Math.min(maxSegments, 10));
        this.testRecipients = testRecipients == null ? List.of() : List.copyOf(testRecipients);
        this.events = events == null ? Map.of() : Map.copyOf(events);
        this.updatedBy = updatedBy;
        this.updatedAt = Instant.now();
    }

    public void registrarCheck(boolean ok, String detail) {
        this.lastCheck = Map.of(
                "at", Instant.now().toString(),
                "ok", ok,
                "detail", detail == null ? "" : detail);
    }

    public String getCode() { return code; }
    public boolean isEnabled() { return enabled; }
    public String getSender() { return sender; }
    public int getMaxSegments() { return maxSegments; }
    public List<String> getTestRecipients() { return testRecipients; }
    public Map<String, Boolean> getEvents() { return events; }
    public Map<String, Object> getLastCheck() { return lastCheck; }
    public Instant getUpdatedAt() { return updatedAt; }
    public String getUpdatedBy() { return updatedBy; }
}
