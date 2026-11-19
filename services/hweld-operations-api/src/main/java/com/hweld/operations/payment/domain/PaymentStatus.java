package com.hweld.operations.payment.domain;

import java.util.EnumSet;
import java.util.Map;
import java.util.Set;

/**
 * Máquina de estados do pagamento junto ao PSP.
 * CONFIRMED é o único estado que significa dinheiro recebido — nunca
 * confirmar por callback de navegador, apenas por webhook assinado/reconcile.
 */
public enum PaymentStatus {
    PENDING,     // criada a cobrança, aguardando ação do pagador
    PROCESSING,  // PSP processando (ex.: cartão em análise)
    CONFIRMED,   // pago — dispara baixa no pedido e fiscal
    FAILED,      // recusado/expirado pelo PSP
    CANCELLED,   // cancelado antes de confirmar
    REFUNDED,    // estornado após confirmação
    EXPIRED;     // PIX/boleto vencido sem pagamento

    private static final Map<PaymentStatus, Set<PaymentStatus>> TRANSICOES = Map.of(
            PENDING, EnumSet.of(PROCESSING, CONFIRMED, FAILED, CANCELLED, EXPIRED),
            PROCESSING, EnumSet.of(CONFIRMED, FAILED, CANCELLED, EXPIRED),
            // Checkout hospedado gera um payment por tentativa no PSP: uma
            // recusada não impede a aprovação da próxima na mesma sessão —
            // FAILED→CONFIRMED (e EXPIRED→CONFIRMED, link sem validade) são
            // reconciliações legítimas vindas de webhook/fetch-back.
            FAILED, EnumSet.of(CONFIRMED),
            EXPIRED, EnumSet.of(CONFIRMED),
            CONFIRMED, EnumSet.of(REFUNDED));

    public boolean canTransitionTo(PaymentStatus next) {
        return TRANSICOES.getOrDefault(this, Set.of()).contains(next);
    }

    public boolean isTerminal() {
        return this == CONFIRMED || this == FAILED || this == CANCELLED
                || this == REFUNDED || this == EXPIRED;
    }
}
