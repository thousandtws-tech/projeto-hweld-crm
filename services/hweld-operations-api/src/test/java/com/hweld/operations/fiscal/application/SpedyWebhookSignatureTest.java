package com.hweld.operations.fiscal.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;

/**
 * Verificação da assinatura Standard Webhooks da Spedy — HMAC-SHA256 sobre
 * `{id}.{ts}.{corpo}`, chave = segredo `whsec_` (base64) sem o prefixo.
 */
class SpedyWebhookSignatureTest {

    private static final String SECRET_B64 = Base64.getEncoder()
            .encodeToString("segredo-de-teste-da-conta".getBytes(StandardCharsets.UTF_8));
    private static final String SECRET = "whsec_" + SECRET_B64;
    private static final String BODY = "{\"id\":\"evt-1\",\"event\":\"invoice.status_changed\",\"data\":{}}";
    private static final String ID = "evt-1";

    private static String assinar(String id, long ts, String body) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(Base64.getDecoder().decode(SECRET_B64), "HmacSHA256"));
        return Base64.getEncoder().encodeToString(
                mac.doFinal((id + "." + ts + "." + body).getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void aceitaAssinaturaValida() throws Exception {
        long ts = System.currentTimeMillis() / 1000;
        String sig = "v1," + assinar(ID, ts, BODY);
        assertThat(SpedyWebhookService.assinaturaValida(SECRET, ID, String.valueOf(ts), sig, BODY))
                .isTrue();
    }

    @Test
    void aceitaSegundaAssinaturaNaRotacao() throws Exception {
        long ts = System.currentTimeMillis() / 1000;
        String valida = assinar(ID, ts, BODY);
        String header = "v1,assInvalidaBase64== v1," + valida;
        assertThat(SpedyWebhookService.assinaturaValida(SECRET, ID, String.valueOf(ts), header, BODY))
                .isTrue();
    }

    @Test
    void rejeitaAssinaturaDeOutroSegredo() throws Exception {
        long ts = System.currentTimeMillis() / 1000;
        String sig = "v1," + assinar(ID, ts, BODY);
        String outro = "whsec_" + Base64.getEncoder().encodeToString("outro".getBytes());
        assertThat(SpedyWebhookService.assinaturaValida(outro, ID, String.valueOf(ts), sig, BODY))
                .isFalse();
    }

    @Test
    void rejeitaTimestampForaDaTolerancia() throws Exception {
        long ts = System.currentTimeMillis() / 1000 - 600; // 10min atrás
        String sig = "v1," + assinar(ID, ts, BODY);
        assertThat(SpedyWebhookService.assinaturaValida(SECRET, ID, String.valueOf(ts), sig, BODY))
                .isFalse();
    }

    @Test
    void rejeitaCorpoAdulterado() throws Exception {
        long ts = System.currentTimeMillis() / 1000;
        String sig = "v1," + assinar(ID, ts, BODY);
        assertThat(SpedyWebhookService.assinaturaValida(
                SECRET, ID, String.valueOf(ts), sig, BODY + " ")).isFalse();
    }

    @Test
    void rejeitaHeadersAusentes() {
        assertThat(SpedyWebhookService.assinaturaValida(SECRET, null, "1", "v1,x", BODY)).isFalse();
        assertThat(SpedyWebhookService.assinaturaValida(SECRET, ID, null, "v1,x", BODY)).isFalse();
        assertThat(SpedyWebhookService.assinaturaValida(SECRET, ID, "1", null, BODY)).isFalse();
    }
}
