package com.hweld.operations.payment.application;

import com.hweld.operations.payment.domain.PaymentMethod;
import com.hweld.operations.payment.domain.PaymentStatus;
import com.hweld.operations.shared.domain.Money;
import java.time.Instant;
import java.util.Map;

/**
 * Port do provedor de pagamento (PSP). Implementações reais — Mercado Pago,
 * Asaas, Pagar.me — são adapters em `payment/infrastructure/provider`.
 * Nenhum PAN/CVV trafega: cartão usa checkout/tokenização do PSP
 * (o retorno é `checkoutUrl`, nunca dados de cartão).
 */
public interface PaymentProvider {

    String name();

    /**
     * Credenciais operacionais presentes? Usado pela resolução `auto`
     * (`PAYMENT_PROVIDER=auto`): PSP real credenciado → stub de fallback.
     */
    default boolean configured() {
        return true;
    }

    ChargeResult createCharge(ChargeRequest request);

    /** Reconciliação — consulta o estado atual da cobrança no PSP. */
    ChargeResult getCharge(String externalId);

    void cancelCharge(String externalId);

    void refundCharge(String externalId, Money amount);

    /**
     * Valida a assinatura do webhook (HMAC sobre o corpo cru).
     * Chamada ANTES de parsear/processar o payload.
     */
    boolean verifyWebhookSignature(String rawBody, String signatureHeader);

    /** Extrai o evento normalizado do corpo do webhook. */
    ParsedWebhook parseWebhook(String rawBody);

    record ChargeRequest(
            String idempotencyKey,
            Money amount,
            PaymentMethod method,
            String description,
            String customerEmail,
            Map<String, Object> metadata) {}

    record ChargeResult(
            String externalId,
            PaymentStatus status,
            String checkoutUrl,
            String pixQrCode,
            String pixCopyPaste,
            Instant expiresAt,
            Map<String, Object> raw) {}

    /**
     * `referenceId` = referência de nível de pedido enviada ao PSP na
     * criação (ex.: `reference_id` do PagBank = nossa idempotency key).
     * Fallback de correlação quando o webhook traz um `externalPaymentId`
     * ainda desconhecido — fluxos hospedados (checkout) geram ids novos
     * por transação. `null` quando o PSP não expõe o campo.
     */
    record ParsedWebhook(
            String eventId,
            String externalPaymentId,
            PaymentStatus status,
            String failureCode,
            String failureMessage,
            Instant occurredAt,
            String referenceId,
            Map<String, Object> raw) {}
}
