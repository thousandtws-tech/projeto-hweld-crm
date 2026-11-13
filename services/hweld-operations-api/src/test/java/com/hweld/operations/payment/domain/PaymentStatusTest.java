package com.hweld.operations.payment.domain;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class PaymentStatusTest {

    @Test
    void pendingAceitaTransicoesEsperadas() {
        assertThat(PaymentStatus.PENDING.canTransitionTo(PaymentStatus.CONFIRMED)).isTrue();
        assertThat(PaymentStatus.PENDING.canTransitionTo(PaymentStatus.FAILED)).isTrue();
        assertThat(PaymentStatus.PENDING.canTransitionTo(PaymentStatus.CANCELLED)).isTrue();
        assertThat(PaymentStatus.PENDING.canTransitionTo(PaymentStatus.EXPIRED)).isTrue();
        assertThat(PaymentStatus.PENDING.canTransitionTo(PaymentStatus.REFUNDED)).isFalse();
    }

    @Test
    void confirmedSoAceitaRefund() {
        assertThat(PaymentStatus.CONFIRMED.canTransitionTo(PaymentStatus.REFUNDED)).isTrue();
        assertThat(PaymentStatus.CONFIRMED.canTransitionTo(PaymentStatus.FAILED)).isFalse();
        assertThat(PaymentStatus.CONFIRMED.canTransitionTo(PaymentStatus.CANCELLED)).isFalse();
    }

    @Test
    void estadosFinaisNaoTransicionam() {
        for (PaymentStatus s : PaymentStatus.values()) {
            assertThat(PaymentStatus.CANCELLED.canTransitionTo(s)).isFalse();
            assertThat(PaymentStatus.REFUNDED.canTransitionTo(s)).isFalse();
            assertThat(PaymentStatus.EXPIRED.canTransitionTo(s)).isFalse();
        }
    }

    @Test
    void transicaoInvalidaLancaExcecao() {
        Payment p = new Payment(java.util.UUID.randomUUID(), 1L, 1L, 1L, "stub",
                PaymentMethod.PIX, new java.math.BigDecimal("10.00"), "k", "staff", "1");
        p.transitionTo(PaymentStatus.CANCELLED, null, null);
        org.assertj.core.api.Assertions.assertThatThrownBy(
                () -> p.transitionTo(PaymentStatus.CONFIRMED, null, null))
                .isInstanceOf(IllegalStateException.class);
    }
}
