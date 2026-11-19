package com.hweld.operations.notification.infrastructure;

import com.hweld.operations.notification.application.SmsProvider;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Adapter de desenvolvimento: "envia" via log estruturado com `messageId`
 * sintético — exercita o ciclo completo (fila → DLR simulável) sem
 * credenciais. Selecionado pelo `SmsProviderRouter` quando `sms-provider`
 * é `log` ou quando `auto` e a integração ainda não tem credenciais.
 */
@Component
public class LogSmsProvider implements SmsProvider {

    private static final Logger log = LoggerFactory.getLogger(LogSmsProvider.class);

    @Override
    public String name() {
        return "log";
    }

    @Override
    public SmsReceipt send(String to, String text) {
        String messageId = "log-" + UUID.randomUUID();
        log.info("sms.send to={} chars={} messageId={}", mask(to), text.length(), messageId);
        return new SmsReceipt(messageId, null, null);
    }

    @Override
    public ConnectionTest testConnection() {
        return new ConnectionTest(true, "provider de log — sem verificação remota (dev)");
    }

    private static String mask(String e164) {
        if (e164 == null || e164.length() < 6) return "***";
        return e164.substring(0, e164.length() - 4) + "****";
    }
}
