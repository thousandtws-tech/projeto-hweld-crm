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
