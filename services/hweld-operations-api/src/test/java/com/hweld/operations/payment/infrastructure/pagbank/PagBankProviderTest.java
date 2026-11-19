package com.hweld.operations.payment.infrastructure.pagbank;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.hweld.operations.notification.domain.IntegrationSettingsRepository;
import com.hweld.operations.notification.infrastructure.infobip.InfobipProperties;
import com.hweld.operations.payment.application.PaymentProvider.ParsedWebhook;
import com.hweld.operations.payment.application.PaymentProperties;
import com.hweld.operations.payment.domain.PaymentStatus;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Contratos do adapter PagBank: mapeamento de status oficial
 * (WAITING/PAID/DECLINED/CANCELED…), extração do webhook Orders API e
 * autenticidade por fetch-back (mecanismo oficial — o PagBank não assina).
 */
class PagBankProviderTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final PagBankClient client = mock(PagBankClient.class);
    private final IntegrationSettingsRepository settings = mock(IntegrationSettingsRepository.class);
    private final PagBankProvider provider = new PagBankProvider(client, settings,
            new PaymentProperties(null, null, 0, false),
            new InfobipProperties(0, null), mapper);

    @Test
    void mapeiaStatusOficiaisParaInternos() {
        assertEquals(PaymentStatus.PENDING, PagBankProvider.mapStatus("WAITING"));
        assertEquals(PaymentStatus.PROCESSING, PagBankProvider.mapStatus("IN_ANALYSIS"));
        assertEquals(PaymentStatus.PROCESSING, PagBankProvider.mapStatus("AUTHORIZED"));
        assertEquals(PaymentStatus.CONFIRMED, PagBankProvider.mapStatus("PAID"));
        assertEquals(PaymentStatus.FAILED, PagBankProvider.mapStatus("DECLINED"));
        assertEquals(PaymentStatus.CANCELLED, PagBankProvider.mapStatus("CANCELED"));
        assertEquals(PaymentStatus.PENDING, PagBankProvider.mapStatus("DESCONHECIDO"));
        assertEquals(PaymentStatus.PENDING, PagBankProvider.mapStatus(null));
    }

    @Test
    void parseWebhookExtraiIdsStatusEChaveDeDedupe() {
        String body = """
            {
              "id": "ORDE_ABC-123",
              "charges": [{
                "id": "CHAR_XYZ-789",
                "status": "PAID",
                "created_at": "2026-01-10T12:00:00Z",
                "paid_at": "2026-01-10T12:05:00Z",
                "payment_response": {"code": "20000", "message": "SUCESSO"}
              }]
            }
            """;

        ParsedWebhook parsed = provider.parseWebhook(body);

        assertEquals("CHAR_XYZ-789", parsed.externalPaymentId());
        assertEquals(PaymentStatus.CONFIRMED, parsed.status());
        assertEquals("ORDE_ABC-123|CHAR_XYZ-789|PAID", parsed.eventId());
        assertEquals("20000", parsed.failureCode());
        assertEquals("2026-01-10T12:05:00Z", parsed.occurredAt().toString());
    }

    @Test
    void fetchBackAceitaNotificacaoQueBateComOEstadoReal() {
        String body = webhook("ORDE_1", "CHAR_1", "PAID");
        when(client.consultarCobranca("CHAR_1")).thenReturn(charge("ORDE_1", "PAID"));

        assertTrue(provider.verifyWebhookSignature(body, null));
    }

    @Test
    void fetchBackRejeitaStatusForjado() {
        // Corpo diz PAID, mas o PagBank informa WAITING — fraude ou desatualizado.
        String body = webhook("ORDE_1", "CHAR_1", "PAID");
        when(client.consultarCobranca("CHAR_1")).thenReturn(charge("ORDE_1", "WAITING"));

        assertFalse(provider.verifyWebhookSignature(body, null));
    }

    @Test
    void fetchBackRejeitaOrderDivergente() {
        // CHAR_1 existe, mas pertence a outro pedido — replay cruzado.
        String body = webhook("ORDE_999", "CHAR_1", "PAID");
        when(client.consultarCobranca("CHAR_1")).thenReturn(charge("ORDE_1", "PAID"));

        assertFalse(provider.verifyWebhookSignature(body, null));
    }

    @Test
    void fetchBackRejeitaQuandoApiFalha() {
        String body = webhook("ORDE_1", "CHAR_1", "PAID");
        when(client.consultarCobranca("CHAR_1"))
                .thenThrow(PagBankException.transporte("timeout"));

        assertFalse(provider.verifyWebhookSignature(body, null));
    }

    @Test
    void fetchBackRejeitaCorpoSemCharges() {
        assertFalse(provider.verifyWebhookSignature("{\"id\":\"ORDE_1\"}", null));
    }

    // ── cartão via checkout hospedado ───────────────────────────────────────

    @Test
    void criarCobrancaCartaoCriaCheckoutEMapeiaLinkPay() throws Exception {
        // settings vazio → portões de habilitação/pausa não bloqueiam o teste.
        when(client.criarCheckout(org.mockito.ArgumentMatchers.<java.util.Map<String, Object>>any()))
                .thenAnswer(inv -> {
                    java.util.Map<String, Object> body = inv.getArgument(0);
                    // Contrato oficial: reference_id propaga para a Order gerada —
                    // é a chave de correlação do webhook transacional.
                    assertEquals("idem-1", body.get("reference_id"));
                    @SuppressWarnings("unchecked")
                    var metodos = (java.util.List<java.util.Map<String, Object>>)
                            body.get("payment_methods");
                    assertEquals("CREDIT_CARD", metodos.get(0).get("type"));
                    assertEquals(Boolean.TRUE, body.get("customer_modifiable"));
                    var checkout = mapper.createObjectNode();
                    checkout.put("id", "CHEC_A1B2");
                    checkout.put("status", "ACTIVE");
                    checkout.put("expiration_date", "2026-01-10T14:00:00Z");
                    var link = checkout.putArray("links").addObject();
                    link.put("rel", "PAY");
                    link.put("href", "https://pagamento.pagbank.com.br/pagamento?code=abc");
                    return checkout;
                });

        var req = new com.hweld.operations.payment.application.PaymentProvider.ChargeRequest(
                "idem-1",
                com.hweld.operations.shared.domain.Money.of(new java.math.BigDecimal("250.00")),
                com.hweld.operations.payment.domain.PaymentMethod.CREDIT_CARD,
                "Pedido PV-1", "c@c.com", java.util.Map.of("pedidoId", "10"));

        var result = provider.createCharge(req);

        assertEquals("CHEC_A1B2", result.externalId());
        assertEquals(PaymentStatus.PENDING, result.status());
        assertEquals("https://pagamento.pagbank.com.br/pagamento?code=abc",
                result.checkoutUrl());
    }

    @Test
    void parseEventoDeCheckoutExtraiStatusDedupeEReferencia() {
        String body = """
            {
              "id": "CHEC_A1B2",
              "reference_id": "idem-1",
              "status": "EXPIRED",
              "created_at": "2026-01-10T12:00:00Z"
            }
            """;

        ParsedWebhook parsed = provider.parseWebhook(body);

        assertEquals("CHEC_A1B2", parsed.externalPaymentId());
        assertEquals(PaymentStatus.EXPIRED, parsed.status());
        assertEquals("CHEC_A1B2|EXPIRED", parsed.eventId());
        assertEquals("idem-1", parsed.referenceId());
    }

    @Test
    void fetchBackDeCheckoutConfereStatusReal() {
        String body = """
            {"id": "CHEC_A1B2", "status": "EXPIRED", "reference_id": "idem-1"}
            """;
        var real = mapper.createObjectNode();
        real.put("id", "CHEC_A1B2");
        real.put("status", "EXPIRED");
        when(client.consultarCheckout("CHEC_A1B2")).thenReturn(real);

        assertTrue(provider.verifyWebhookSignature(body, null));
    }

    @Test
    void fetchBackDeCheckoutRejeitaStatusDivergente() {
        String body = """
            {"id": "CHEC_A1B2", "status": "EXPIRED"}
            """;
        var real = mapper.createObjectNode();
        real.put("id", "CHEC_A1B2");
        real.put("status", "ACTIVE"); // ainda ativo no PagBank — evento forjado
        when(client.consultarCheckout("CHEC_A1B2")).thenReturn(real);

        assertFalse(provider.verifyWebhookSignature(body, null));
    }

    @Test
    void getChargeEReconciliacaoRoteiamCheckoutParaEndpointProprio() {
        var checkout = mapper.createObjectNode();
        checkout.put("id", "CHEC_A1B2");
        checkout.put("status", "PAID"); // pago pelo link — reconcilia como CONFIRMED
        checkout.putArray("links").addObject()
                .put("rel", "PAY").put("href", "https://pay.link/x");
        when(client.consultarCheckout("CHEC_A1B2")).thenReturn(checkout);

        var result = provider.getCharge("CHEC_A1B2");

        assertEquals(PaymentStatus.CONFIRMED, result.status());
        assertEquals("https://pay.link/x", result.checkoutUrl());
        org.mockito.Mockito.verify(client, org.mockito.Mockito.never())
                .consultarCobranca(org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void cancelDeCheckoutInativaOLinkEmVezDeCancelarCobranca() {
        provider.cancelCharge("CHEC_A1B2");

        org.mockito.Mockito.verify(client).inativarCheckout("CHEC_A1B2");
        org.mockito.Mockito.verify(client, org.mockito.Mockito.never())
                .cancelarCobranca(org.mockito.ArgumentMatchers.anyString(),
                        org.mockito.ArgumentMatchers.any());
    }

    private String webhook(String orderId, String chargeId, String status) {
        return """
            {"id": "%s", "charges": [{"id": "%s", "status": "%s"}]}
            """.formatted(orderId, chargeId, status);
    }

    private ObjectNode charge(String orderId, String status) {
        var n = mapper.createObjectNode();
        n.put("id", "CHAR_1");
        n.put("status", status);
        n.putObject("metadata").put("ps_order_id", orderId);
        return n;
    }
}
