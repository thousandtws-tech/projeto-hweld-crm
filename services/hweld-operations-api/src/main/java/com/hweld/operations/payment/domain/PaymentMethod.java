package com.hweld.operations.payment.domain;

public enum PaymentMethod {
    PIX,
    CREDIT_CARD,  // sempre via checkout/tokenização do PSP — PAN/CVV nunca trafega aqui
    BOLETO
}
