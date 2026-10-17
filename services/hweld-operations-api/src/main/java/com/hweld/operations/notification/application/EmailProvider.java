package com.hweld.operations.notification.application;

/** Port de envio de e-mail — SMTP (`SmtpEmailProvider`) ou log (dev). */
public interface EmailProvider {

    String name();

    /** @throws EmailSendException em falha transitória/permanente */
    void send(String to, String subject, String htmlBody, String textBody);

    class EmailSendException extends RuntimeException {
        public EmailSendException(String msg) { super(msg); }
        public EmailSendException(String msg, Throwable cause) { super(msg, cause); }
    }
}
