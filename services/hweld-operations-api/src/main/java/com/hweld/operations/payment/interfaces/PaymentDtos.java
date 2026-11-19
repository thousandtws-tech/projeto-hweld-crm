package com.hweld.operations.payment.interfaces;

import com.hweld.operations.payment.domain.Payment;
import com.hweld.operations.payment.domain.PaymentMethod;
import com.hweld.operations.payment.domain.PaymentStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

public final class PaymentDtos {

    private PaymentDtos() {
    }

    /**
     * `cardToken`/`paymentMethodId`/`installments`/`issuerId`/
     * `identification*` — Checkout Transparente Mercado Pago: o SDK do MP
     * tokeniza PAN/CVV no navegador e só o token (uso único, ~7 dias)
     * chega aqui; PAN/CVV nunca transitam ou persistem nesta API.
     * Ausentes → provider decide o fluxo (Checkout Pro hospedado).
     */
    public record CreatePaymentRequest(
            @NotNull @Positive Long pedidoId,
            @NotNull PaymentMethod method,
            String provider,
            String idempotencyKey,
            String emailContato,
            String cardToken,
            Integer installments,
            String paymentMethodId,
            String issuerId,
            String identificationType,
            String identificationNumber) {
    }

    public record PaymentResponse(
            UUID id, Long pedidoId, Long empresaId, Long contatoId,
            String provider, PaymentMethod method, PaymentStatus status,
            BigDecimal amount, String currency, String externalId,
            String checkoutUrl, String pixQrCode, String pixCopyPaste,
            Instant expiresAt, String failureCode, String failureMessage,
            Instant createdAt, Instant updatedAt) {

        public static PaymentResponse from(Payment p) {
            return new PaymentResponse(p.getId(), p.getPedidoId(), p.getEmpresaId(), p.getContatoId(),
                    p.getProvider(), p.getMethod(), p.getStatus(), p.getAmount(), p.getCurrency(),
                    p.getExternalId(), p.getCheckoutUrl(), p.getPixQrCode(), p.getPixCopyPaste(),
                    p.getExpiresAt(), p.getFailureCode(), p.getFailureMessage(),
                    p.getCreatedAt(), p.getUpdatedAt());
        }
    }
}
