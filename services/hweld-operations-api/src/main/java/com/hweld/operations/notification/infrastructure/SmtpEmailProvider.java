package com.hweld.operations.notification.infrastructure;

import com.hweld.operations.notification.application.EmailProvider;
import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "hweld.notification.email-provider", havingValue = "smtp")
public class SmtpEmailProvider implements EmailProvider {

    private static final Logger log = LoggerFactory.getLogger(SmtpEmailProvider.class);

    private final JavaMailSender mailSender;
    private final String from;
    private final String fromName;

    public SmtpEmailProvider(JavaMailSender mailSender,
            @Value("${hweld.notification.default-from}") String from,
            @Value("${hweld.notification.default-from-name:HWeld}") String fromName) {
        this.mailSender = mailSender;
        this.from = from;
        this.fromName = fromName;
    }

    @Override
    public String name() {
        return "smtp";
    }

    @Override
    public void send(String to, String subject, String htmlBody, String textBody) {
        try {
            MimeMessage msg = mailSender.createMimeMessage();
            var helper = new MimeMessageHelper(msg, htmlBody != null, "UTF-8");
            helper.setFrom(from, fromName);
            helper.setTo(to);
            helper.setSubject(subject);
            if (htmlBody != null) {
                helper.setText(textBody != null ? textBody : "", htmlBody);
            } else {
                helper.setText(textBody != null ? textBody : "");
            }
            mailSender.send(msg);
        } catch (Exception e) {
            throw new EmailSendException("smtp falhou: " + e.getMessage(), e);
        }
    }
}
