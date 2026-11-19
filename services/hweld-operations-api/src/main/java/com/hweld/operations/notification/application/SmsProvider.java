package com.hweld.operations.notification.application;

/**
 * Port de envio SMS — análogo ao `EmailProvider`. Implementações: `log`
 * (dev, default) e `infobip` (`SMS_PROVIDER=infobip` + credenciais env).
 */
public interface SmsProvider {

    /** Recibo do envio aceito pelo provider (correlação para DLR). */
    record SmsReceipt(String messageId, String bulkId, Integer segments) {}

    /** Resultado do teste de conexão — NUNCA envia SMS (consulta read-only). */
    record ConnectionTest(boolean ok, String detail) {}

    String name();

    /**
     * @throws SmsSendException com `kind` tipado — o dispatcher decide
     *         retry (TRANSIENT/RATE_LIMIT) ou DEAD (permanentes).
     */
    SmsReceipt send(String to, String text);

    /** Consulta de sanidade sem custo — ex.: saldo/perfil da conta. */
    default ConnectionTest testConnection() {
        return new ConnectionTest(true, "provider " + name() + " sem verificação remota");
    }
}
