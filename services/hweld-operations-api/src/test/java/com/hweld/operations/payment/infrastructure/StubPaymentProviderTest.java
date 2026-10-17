package com.hweld.operations.payment.infrastructure;

import static org.assertj.core.api.Assertions.assertThat;

import com.hweld.operations.payment.application.PaymentProperties;
import com.hweld.operations.payment.application.PaymentProvider;
import com.hweld.operations.payment.domain.PaymentMethod;
import com.hweld.operations.payment.domain.PaymentStatus;
import com.hweld.operations.payment.infrastructure.provider.StubPaymentProvider;
import com.hweld.operations.shared.domain.Money;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class StubPaymentProviderTest {

    private static final String SECRET = "segredo-webhook-teste";

    private StubPaymentProvider provider(Map<String, String> secrets, boolean allowUnsigned) {
        return new StubPaymentProvider(
                new PaymentProperties("stub", secrets, 30, allowUnsigned), new ObjectMapper());
    }

    private static String hmac(String body, String secret) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void createChargePixRetornaCopiaECola() {
        var p = provider(Map.of(), false);
        var r = p.createCharge(new PaymentProvider.ChargeRequest("idem-1",
                Money.of(new BigDecimal("99.90")), PaymentMethod.PIX, "Pedido 1",
                "c@x.com", Map.of()));
        assertThat(r.externalId()).startsWith("stub_");
        assertThat(r.status()).isEqualTo(PaymentStatus.PENDING);
        assertThat(r.pixCopyPaste()).contains("BR.GOV.BCB.PIX");
        assertThat(r.expiresAt()).isNotNull();
    }

    @Test
    void assinaturaCorretaValida() throws Exception {
        var p = provider(Map.of("stub", SECRET), false);
        String body = "{\"eventId\":\"e1\",\"externalId\":\"stub_1\",\"status\":\"CONFIRMED\"}";
        assertThat(p.verifyWebhookSignature(body, "sha256=" + hmac(body, SECRET))).isTrue();
        assertThat(p.verifyWebhookSignature(body, hmac(body, SECRET))).isTrue();
    }

    @Test
    void assinaturaErradaRejeita() {
        var p = provider(Map.of("stub", SECRET), false);
        assertThat(p.verifyWebhookSignature("{}", "sha256=deadbeef")).isFalse();
    }

    @Test
    void semAssinaturaRejeitaEmModoEstritoEPermiteEmDev() {
        assertThat(provider(Map.of(), false).verifyWebhookSignature("{}", null)).isFalse();
        assertThat(provider(Map.of(), true).verifyWebhookSignature("{}", null)).isTrue();
    }

    @Test
    void parseNormalizaWebhook() {
        var p = provider(Map.of(), false);
        var w = p.parseWebhook("{\"eventId\":\"e9\",\"externalId\":\"stub_9\",\"status\":\"FAILED\",\"failureCode\":\"card_declined\"}");
        assertThat(w.eventId()).isEqualTo("e9");
        assertThat(w.externalPaymentId()).isEqualTo("stub_9");
        assertThat(w.status()).isEqualTo(PaymentStatus.FAILED);
        assertThat(w.failureCode()).isEqualTo("card_declined");
    }
}
