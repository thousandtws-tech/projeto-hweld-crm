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

    record ParsedWebhook(
            String eventId,
            String externalPaymentId,
            PaymentStatus status,
            String failureCode,
            String failureMessage,
            Instant occurredAt,
            Map<String, Object> raw) {}
}
