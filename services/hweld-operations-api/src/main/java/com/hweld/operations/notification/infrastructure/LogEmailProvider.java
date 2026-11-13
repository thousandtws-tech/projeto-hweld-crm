package com.hweld.operations.notification.infrastructure;

import com.hweld.operations.notification.application.EmailProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Adapter default de desenvolvimento: "envia" via log estruturado.
 * Em produção configurar EMAIL_PROVIDER=smtp + SMTP_*.
 */
@Component
@ConditionalOnProperty(name = "hweld.notification.email-provider", havingValue = "log", matchIfMissing = true)
public class LogEmailProvider implements EmailProvider {

    private static final Logger log = LoggerFactory.getLogger(LogEmailProvider.class);

    @Override
    public String name() {
        return "log";
    }

    @Override
    public void send(String to, String subject, String htmlBody, String textBody) {
        log.info("email.send to={} subject=\"{}\" bytesHtml={}", to, subject,
                htmlBody != null ? htmlBody.length() : 0);
    }
}
