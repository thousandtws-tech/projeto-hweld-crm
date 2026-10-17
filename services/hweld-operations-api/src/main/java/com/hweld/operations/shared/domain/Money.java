package com.hweld.operations.shared.domain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;

/**
 * Valor monetário com política explícita: scale 2, HALF_EVEN, moeda ISO 4217.
 * Nunca float/double para valores financeiros.
 */
public record Money(BigDecimal amount, String currency) implements Comparable<Money> {

    public static final String BRL = "BRL";
    public static final int SCALE = 2;

    public Money {
        Objects.requireNonNull(amount, "amount é obrigatório");
        amount = amount.setScale(SCALE, RoundingMode.HALF_EVEN);
        currency = currency == null ? BRL : currency.toUpperCase();
        if (currency.length() != 3) {
            throw new IllegalArgumentException("currency deve ser ISO 4217 (3 letras): " + currency);
        }
    }

    public static Money of(BigDecimal amount) {
        return new Money(amount, BRL);
    }

    public static Money of(String amount) {
        return new Money(new BigDecimal(amount), BRL);
    }

    public static Money zero() {
        return new Money(BigDecimal.ZERO, BRL);
    }

    public boolean isPositive() {
        return amount.signum() > 0;
    }

    @Override
    public int compareTo(Money o) {
        return amount.compareTo(o.amount);
    }
}
