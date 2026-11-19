package com.hweld.operations.payment.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.hweld.operations.payment.domain.Payment;
import com.hweld.operations.payment.domain.PaymentMethod;
import com.hweld.operations.payment.domain.PaymentRepository;
import com.hweld.operations.payment.domain.PaymentStatus;
import com.hweld.operations.payment.domain.WebhookEventRepository;
import com.hweld.operations.payment.infrastructure.WebhookDedupe;
import com.hweld.operations.shared.infrastructure.audit.AuditLogRepository;
import com.hweld.operations.shared.interfaces.error.ApiException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import tools.jackson.databind.ObjectMapper;

class WebhookServiceTest {

    private PaymentProvider provider;
    private WebhookEventRepository webhookEvents;
    private PaymentRepository payments;
    private PaymentService paymentService;
    private AuditLogRepository auditLogs;
    private WebhookDedupe dedupe;
    private WebhookService service;

    @BeforeEach
    void setUp() {
        provider = mock(PaymentProvider.class);
        webhookEvents = mock(WebhookEventRepository.class);
        payments = mock(PaymentRepository.class);
        paymentService = mock(PaymentService.class);
        auditLogs = mock(AuditLogRepository.class);
        dedupe = mock(WebhookDedupe.class);
        when(provider.name()).thenReturn("stub");
        var props = new PaymentProperties("stub", Map.of(), 30, false);
        var registry = new ProviderRegistry(List.of(provider), props);
        service = new WebhookService(registry, webhookEvents, payments, paymentService, auditLogs, dedupe);
        // O service recarrega a linha gravada pelo dedupe (TX separada) —
        // nos testes devolvemos uma entidade equivalente.
        when(webhookEvents.findByProviderAndEventId(any(), any())).thenAnswer(inv ->
                Optional.of(new com.hweld.operations.payment.domain.WebhookEventRecord(
                        inv.getArgument(0), inv.getArgument(1), true, Map.of())));
    }

    private PaymentProvider.ParsedWebhook parsed(String eventId, PaymentStatus status) {
        return new PaymentProvider.ParsedWebhook(eventId, "stub_1", status,
                null, null, Instant.now(), null, Map.of("k", "v"));
    }

    private Payment payment() {
        Payment p = new Payment(UUID.randomUUID(), 10L, 7L, 42L, "stub",
                PaymentMethod.PIX, new BigDecimal("10.00"), "k", "portal", "42");
        p.applyProviderResult("stub_1", null, "QR", "QR", Instant.now());
        return p;
    }

    @Test
    void webhookValidoProcessaPagamento() {
        when(provider.parseWebhook("{}")).thenReturn(parsed("evt-1", PaymentStatus.CONFIRMED));
        when(provider.verifyWebhookSignature("{}", "sig")).thenReturn(true);
        when(payments.findByProviderAndExternalId("stub", "stub_1")).thenReturn(Optional.of(payment()));

        assertThat(service.process("stub", "{}", "sig")).isEqualTo(WebhookService.Result.PROCESSED);
        verify(paymentService).applyWebhookResult(any(), any());
    }

    @Test
    void assinaturaInvalidaRejeitaSemProcessar() {
        when(provider.parseWebhook("{}")).thenReturn(parsed("evt-2", PaymentStatus.CONFIRMED));
        when(provider.verifyWebhookSignature("{}", "bad")).thenReturn(false);

        assertThat(service.process("stub", "{}", "bad")).isEqualTo(WebhookService.Result.REJECTED);
        verify(paymentService, never()).applyWebhookResult(any(), any());
        verify(dedupe, never()).record(any());
        verify(auditLogs).save(any());
    }

    @Test
    void eventoDuplicadoEhNoop() {
        when(provider.parseWebhook("{}")).thenReturn(parsed("evt-1", PaymentStatus.CONFIRMED));
        when(provider.verifyWebhookSignature("{}", "sig")).thenReturn(true);
        doThrow(new DataIntegrityViolationException("dup")).when(dedupe).record(any());

        assertThat(service.process("stub", "{}", "sig")).isEqualTo(WebhookService.Result.DUPLICATE);
        verify(paymentService, never()).applyWebhookResult(any(), any());
    }

    @Test
    void externalIdDesconhecidoIgnoraSemErro() {
        when(provider.parseWebhook("{}")).thenReturn(parsed("evt-3", PaymentStatus.CONFIRMED));
        when(provider.verifyWebhookSignature("{}", "sig")).thenReturn(true);
        when(payments.findByProviderAndExternalId("stub", "stub_1")).thenReturn(Optional.empty());

        assertThat(service.process("stub", "{}", "sig")).isEqualTo(WebhookService.Result.IGNORED);
        verify(paymentService, never()).applyWebhookResult(any(), any());
    }

    @Test
    void providerDesconhecidoDaErroDeValidacao() {
        PaymentProvider outro = mock(PaymentProvider.class);
        when(outro.name()).thenReturn("outro");
        var svc = new WebhookService(new ProviderRegistry(List.of(outro),
                new PaymentProperties("stub", Map.of(), 30, false)),
                webhookEvents, payments, paymentService, auditLogs, dedupe);
        org.assertj.core.api.Assertions.assertThatThrownBy(
                () -> svc.process("inexistente", "{}", "sig"))
                .isInstanceOf(ApiException.class);
    }
}
