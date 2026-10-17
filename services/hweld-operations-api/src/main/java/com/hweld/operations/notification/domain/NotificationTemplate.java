package com.hweld.operations.notification.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "notification_templates")
public class NotificationTemplate {

    @Id
    @Column(length = 60)
    private String code;

    @Column(nullable = false, columnDefinition = "text")
    private String channel = "EMAIL";

    @Column(nullable = false, length = 200)
    private String subject;

    @Column(name = "body_html", nullable = false, columnDefinition = "text")
    private String bodyHtml;

    @Column(name = "body_text", columnDefinition = "text")
    private String bodyText;

    @Column(nullable = false, length = 10)
    private String locale = "pt-BR";

    @Column(nullable = false)
    private boolean active = true;

    @Column(nullable = false)
    private int version = 1;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    protected NotificationTemplate() {}

    public String getCode() { return code; }
    public String getChannel() { return channel; }
    public String getSubject() { return subject; }
    public String getBodyHtml() { return bodyHtml; }
    public String getBodyText() { return bodyText; }
    public String getLocale() { return locale; }
    public boolean isActive() { return active; }
}
