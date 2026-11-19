package com.hweld.operations.payment.infrastructure.mercadopago;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.hweld.operations.notification.domain.IntegrationSettings;
import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.notification.infrastructure.infobip.InfobipProperties;
import com.hweld.operations.payment.application.PaymentProvider.ChargeRequest;
import com.hweld.operations.payment.application.PaymentProvider.ChargeResult;
import com.hweld.operations.payment.application.PaymentProvider.ParsedWebhook;
import com.hweld.operations.payment.application.PaymentProperties;
import com.hweld.operations.payment.domain.PaymentMethod;
import com.hweld.operations.payment.domain.PaymentStatus;
import com.hweld.operations.shared.domain.Money;
import com.hweld.operations.shared.infrastructure.security.CredentialCipher;
import com.hweld.operations.shared.interfaces.error.ApiException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import tools.jackson.databind.ObjectMapper;

/**
 * Contratos do adapter Mercado Pago: assinatura HMAC oficial
 * (`id:…;request-id:…;ts:…;` + tolerância ±300s + tempo constante),
 * Pix via `/v1/payments`, cartão via Checkout Pro, fetch-back do status
 * real no parse e roteamento cancel/estorno payment × preference.
 */
class MercadoPagoProviderTest {

    private static final String SEGREDO = "segredo-teste-webhook";

    private final ObjectMapper mapper = new ObjectMapper();
    private final MercadoPagoClient client = mock(MercadoPagoClient.class);
    private final IntegrationSettingsRepository settings =
            mock(IntegrationSettingsRepository.class);
    private final CredentialCipher cipher = mock(CredentialCipher.class);
    private final MercadoPagoProvider provider = new MercadoPagoProvider(client, settings,
            cipher, new PaymentProperties(null, null, 30, false),
            new InfobipProperties(0, "https://api.example.com"), mapper);

    private IntegrationSettings configurado() {
        IntegrationSettings cfg = IntegrationSettings.criar(
                IntegrationSettings.MERCADOPAGO_PAGAMENTOS);
        cfg.definirApiKey("enc-token");
        cfg.definirWebhookSecret("enc-segredo");
        cfg.atualizarMercadoPago("Conta Teste", true, MercadoPagoClient.BASE_URL,
                "123", false, Map.of("ambiente", "teste", "parcelas_max", 6), "t:1");
        when(settings.findById(IntegrationSettings.MERCADOPAGO_PAGAMENTOS))
                .thenReturn(Optional.of(cfg));
        when(cipher.decrypt("enc-token")).thenReturn("TEST-token");
        when(cipher.decrypt("enc-segredo")).thenReturn(SEGREDO);
        return cfg;
    }

    private ChargeRequest req(PaymentMethod metodo) {
        return new ChargeRequest("idem-1", new Money(new BigDecimal("199.90"), "BRL"),
                metodo, "Pedido 42", "cli@x.com",
                Map.of("pedidoId", 42, "pedidoNumero", "42"));
    }

    @Test
    void mapeiaStatusOficiaisParaInternos() {
        assertEquals(PaymentStatus.PENDING, MercadoPagoProvider.mapStatus("pending", null));
        assertEquals(PaymentStatus.PROCESSING, MercadoPagoProvider.mapStatus("authorized", null));
        assertEquals(PaymentStatus.PROCESSING, MercadoPagoProvider.mapStatus("in_process", null));
        assertEquals(PaymentStatus.PROCESSING, MercadoPagoProvider.mapStatus("in_mediation", null));
        assertEquals(PaymentStatus.CONFIRMED, MercadoPagoProvider.mapStatus("approved", null));
        assertEquals(PaymentStatus.FAILED, MercadoPagoProvider.mapStatus("rejected", null));
        assertEquals(PaymentStatus.FAILED, MercadoPagoProvider.mapStatus("charged_back", null));
        assertEquals(PaymentStatus.CANCELLED, MercadoPagoProvider.mapStatus("cancelled", null));
        assertEquals(PaymentStatus.EXPIRED, MercadoPagoProvider.mapStatus("cancelled", "expired"));
        assertEquals(PaymentStatus.REFUNDED, MercadoPagoProvider.mapStatus("refunded", null));
        assertEquals(PaymentStatus.PENDING, MercadoPagoProvider.mapStatus(null, null));
    }

    @Test
    void createChargePixEnviaContratoOficial() throws Exception {
        configurado();
        var payment = mapper.readTree("""
            {"id": 123456789, "status": "pending",
             "date_of_expiration": "2026-01-10T12:30:00.000-03:00",
             "point_of_interaction": {"transaction_data": {
                "qr_code": "00020126...", "qr_code_base64": "iVBORw0...",
                "ticket_url": "https://mpago.la/pix/abc"}}}
            """);
        when(client.criarPagamento(any(), eq("idem-1"))).thenReturn(payment);

        ChargeResult r = provider.createCharge(req(PaymentMethod.PIX));

        assertEquals("123456789", r.externalId());
        assertEquals(PaymentStatus.PENDING, r.status());
        assertEquals("00020126...", r.pixCopyPaste());
        assertEquals("iVBORw0...", r.pixQrCode());

        @SuppressWarnings("unchecked")
        org.mockito.ArgumentCaptor<Map<String, Object>> captor =
                org.mockito.ArgumentCaptor.forClass(Map.class);
        verify(client).criarPagamento(captor.capture(), eq("idem-1"));
        Map<String, Object> body = captor.getValue();
        assertEquals(new BigDecimal("199.90"), body.get("transaction_amount"));
        assertEquals("pix", body.get("payment_method_id"));
        assertEquals("idem-1", body.get("external_reference"));
        assertEquals("https://api.example.com/api/v1/webhooks/mercadopago",
                body.get("notification_url"));
        assertEquals(Map.of("email", "cli@x.com"), body.get("payer"));
    }

    @Test
    void createChargeCartaoUsaCheckoutProSemPan() {
        configurado();
        var pref = mapper.readTree("""
            {"id": "123-abc-def", "init_point": "https://mercadopago.com/checkout/v1/redirect?pref_id=123",
             "sandbox_init_point": "https://sandbox.mercadopago.com/checkout/v1/redirect?pref_id=123",
             "expiration_date_to": "2026-01-10T12:30:00Z"}
            """);
        when(client.criarPreferencia(any(), eq("idem-1"))).thenReturn(pref);

        ChargeResult r = provider.createCharge(req(PaymentMethod.CREDIT_CARD));

        assertEquals("123-abc-def", r.externalId());
        // ambiente=teste → sandbox_init_point.
        assertTrue(r.checkoutUrl().startsWith("https://sandbox.mercadopago.com"));
        assertEquals(PaymentStatus.PENDING, r.status());

        // account_money não pode ser excluído — a API do MP rejeita a
        // preferência inteira ("account_money cannot be excluded").
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> body = ArgumentCaptor.forClass(Map.class);
        verify(client).criarPreferencia(body.capture(), eq("idem-1"));
        @SuppressWarnings("unchecked")
        Map<String, Object> pm = (Map<String, Object>) body.getValue().get("payment_methods");
        @SuppressWarnings("unchecked")
        List<Map<String, String>> excluidos =
                pm != null ? (List<Map<String, String>>) pm.get("excluded_payment_types") : null;
        assertTrue(excluidos == null || excluidos.stream()
                .noneMatch(e -> "account_money".equals(e.get("id"))));
    }

    @Test
    void boletoTemErroTipadoSemSuporteFingido() {
        configurado();
        assertThrows(ApiException.class,
                () -> provider.createCharge(req(PaymentMethod.BOLETO)));
    }

    @Test
    void webhookAssinaturaValidaPassa() throws Exception {
        configurado();
        String ts = String.valueOf(Instant.now().getEpochSecond());
        String body = """
            {"id": 999000111, "type": "payment", "data": {"id": "123456789"}}
            """;
        String v1 = hmac("id:123456789;request-id:req-42;ts:" + ts + ";", SEGREDO);
        Map<String, String> headers = Map.of(
                "x-signature", "ts=" + ts + ",v1=" + v1,
                "x-request-id", "req-42");
        assertTrue(provider.verifyWebhookSignature(body, headers));
    }

    @Test
    void webhookAssinaturaForjadaRejeita() {
        configurado();
        String ts = String.valueOf(Instant.now().getEpochSecond());
        String body = """
            {"id": 999000111, "type": "payment", "data": {"id": "123456789"}}
            """;
        Map<String, String> headers = Map.of(
                "x-signature", "ts=" + ts + ",v1=deadbeefdeadbeef",
                "x-request-id", "req-42");
        assertFalse(provider.verifyWebhookSignature(body, headers));
    }

    @Test
    void webhookTimestampForaDaJanelaRejeita() throws Exception {
        configurado();
        String ts = String.valueOf(Instant.now().getEpochSecond() - 600);
        String body = """
            {"id": 999000111, "type": "payment", "data": {"id": "123456789"}}
            """;
        String v1 = hmac("id:123456789;request-id:req-42;ts:" + ts + ";", SEGREDO);
        Map<String, String> headers = Map.of(
                "x-signature", "ts=" + ts + ",v1=" + v1,
                "x-request-id", "req-42");
        assertFalse(provider.verifyWebhookSignature(body, headers));
    }

    @Test
    void webhookSemSegredoConfiguradoRejeitaTudo() {
        IntegrationSettings cfg = IntegrationSettings.criar(
                IntegrationSettings.MERCADOPAGO_PAGAMENTOS);
        when(settings.findById(IntegrationSettings.MERCADOPAGO_PAGAMENTOS))
                .thenReturn(Optional.of(cfg));
        assertFalse(provider.verifyWebhookSignature("{}", Map.of()));
    }

    @Test
    void parseWebhookPaymentConsultaEstadoRealEExtraiReferencia() {
        configurado();
        when(client.consultarPagamento("123456789")).thenReturn(mapper.readTree("""
            {"id": 123456789, "status": "approved", "status_detail": "accredited",
             "external_reference": "pedido-42-idem"}
            """));
        String body = """
            {"id": 999000111, "type": "payment", "action": "payment.updated",
             "data": {"id": "123456789"}, "date_created": "2026-01-10T12:00:00Z"}
            """;

        ParsedWebhook parsed = provider.parseWebhook(body);

        assertEquals("123456789", parsed.externalPaymentId());
        assertEquals(PaymentStatus.CONFIRMED, parsed.status());
        assertEquals("pedido-42-idem", parsed.referenceId());
        assertEquals("notif-999000111", parsed.eventId());
    }

    @Test
    void parseWebhookOutroTipoViraEventoDeRegistro() {
        String body = """
            {"id": 888, "type": "merchant_order", "data": {"id": "555"}}
            """;
        ParsedWebhook parsed = provider.parseWebhook(body);
        assertEquals("555", parsed.externalPaymentId());
        assertEquals(PaymentStatus.PENDING, parsed.status());
        assertEquals("notif-888", parsed.eventId());
    }

    @Test
    void cancelRoteiaPorTipoDeId() {
        configurado();
        provider.cancelCharge("123456789");
        verify(client).cancelarPagamento("123456789");
        assertThrows(ApiException.class, () -> provider.cancelCharge("pref-abc-123"));
    }

    @Test
    void refundParcialUsaAmountEmReais() {
        configurado();
        provider.refundCharge("123456789", new Money(new BigDecimal("50.00"), "BRL"));
        verify(client).estornarPagamento(eq("123456789"),
                eq(Map.of("amount", new BigDecimal("50.00"))),
                eq("refund-123456789-parcial"));
    }

    private static String hmac(String manifest, String segredo) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(segredo.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return java.util.HexFormat.of().formatHex(
                mac.doFinal(manifest.getBytes(StandardCharsets.UTF_8)));
    }
}
