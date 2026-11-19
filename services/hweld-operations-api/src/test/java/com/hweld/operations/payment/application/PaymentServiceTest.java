package com.hweld.operations.payment.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.hweld.operations.payment.domain.Payment;
import com.hweld.operations.payment.domain.PaymentMethod;
import com.hweld.operations.payment.domain.PaymentRepository;
import com.hweld.operations.payment.domain.PaymentStatus;
import com.hweld.operations.payment.domain.PaymentTransactionRepository;
import com.hweld.operations.shared.domain.Money;
import com.hweld.operations.shared.infrastructure.audit.AuditService;
import com.hweld.operations.shared.infrastructure.coreapi.OrderGateway;
import com.hweld.operations.shared.infrastructure.coreapi.OrderGateway.OrderInfo;
import com.hweld.operations.shared.infrastructure.outbox.Outbox;
import com.hweld.operations.shared.infrastructure.security.AuthPrincipal;
import com.hweld.operations.shared.interfaces.error.ApiException;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class PaymentServiceTest {

    private PaymentRepository payments;
    private PaymentTransactionRepository transactions;
    private PaymentProvider provider;
    private OrderGateway orderGateway;
    private Outbox outbox;
    private AuditService audit;
    private PaymentService service;

    private final AuthPrincipal staff = new AuthPrincipal("staff", 1L, "admin");
    private final AuthPrincipal portal = new AuthPrincipal("portal", 42L, null);

    @BeforeEach
    void setUp() {
        payments = mock(PaymentRepository.class);
        transactions = mock(PaymentTransactionRepository.class);
        provider = mock(PaymentProvider.class);
        orderGateway = mock(OrderGateway.class);
        outbox = mock(Outbox.class);
        audit = mock(AuditService.class);
        // "psp-teste" — portal não pode selecionar stub; o registry devolve
        // este mock como default para qualquer ator.
        when(provider.name()).thenReturn("psp-teste");
        var props = new PaymentProperties("psp-teste", Map.of(), 30, false);
        var registry = new ProviderRegistry(List.of(provider), props);
        service = new PaymentService(payments, transactions, registry, orderGateway, outbox, audit, props);
    }

    private OrderInfo order(String status) {
        return new OrderInfo(10L, "PV-00010", status, 7L, 42L, Money.of(new BigDecimal("199.90")),
                "c@x.com", "41999887766");
    }

    @Test
    void criaPagamentoPixComDadosDoPedido() {
        when(orderGateway.getOrder(10L, "jwt", true)).thenReturn(order("aguardando_pagamento"));
        when(payments.findByIdempotencyKey(anyString())).thenReturn(Optional.empty());
        when(provider.createCharge(any())).thenAnswer(inv -> {
            var req = (PaymentProvider.ChargeRequest) inv.getArgument(0);
            return new PaymentProvider.ChargeResult("stub_1", PaymentStatus.PENDING, null,
                    "PIXCOPIA", "PIXCOPIA", Instant.now().plusSeconds(1800), Map.of());
        });

        Payment p = service.create(new PaymentService.CreatePaymentCommand(
                10L, PaymentMethod.PIX, null, null, null, null, null, null, null, null, null), portal, "jwt");

        assertThat(p.getStatus()).isEqualTo(PaymentStatus.PENDING);
        assertThat(p.getAmount()).isEqualByComparingTo("199.90");
        assertThat(p.getPixCopyPaste()).isEqualTo("PIXCOPIA");
        assertThat(p.getPedidoId()).isEqualTo(10L);
        verify(payments).saveAndFlush(any());
        verify(transactions).save(any());
        verify(outbox).publish(anyString(), anyString(), any());
        verify(audit).record(anyString(), anyString(), anyString(), any());
    }

    @Test
    void idempotenciaRetornaExistenteSemChamarProvider() {
        Payment existente = new Payment(UUID.randomUUID(), 10L, 7L, 42L, "psp-teste",
                PaymentMethod.PIX, new BigDecimal("199.90"), "pedido-10-PIX-psp-teste", "portal", "42");
        when(orderGateway.getOrder(10L, "jwt", true)).thenReturn(order("aguardando_pagamento"));
        when(payments.findByIdempotencyKey("pedido-10-PIX-psp-teste")).thenReturn(Optional.of(existente));

        Payment p = service.create(new PaymentService.CreatePaymentCommand(
                10L, PaymentMethod.PIX, null, null, null, null, null, null, null, null, null), portal, "jwt");

        assertThat(p).isSameAs(existente);
        verify(provider, never()).createCharge(any());
        verify(outbox, never()).publish(anyString(), anyString(), any());
    }

    @Test
    void cobrancaExpiradaReemiteComChaveDerivada() {
        // Preferência/QR morto no PSP mas PENDING local — o retry expira e
        // reemite com a próxima chave da cadeia (-r2), nunca o link velho.
        Payment morta = new Payment(UUID.randomUUID(), 10L, 7L, 42L, "stub",
                PaymentMethod.CREDIT_CARD, new BigDecimal("199.90"),
                "pedido-10-credit_card", "portal", "42");
        morta.applyProviderResult("123-pref", "https://mp/link-morto", null, null,
                Instant.now().minusSeconds(60));
        when(orderGateway.getOrder(10L, "jwt", true)).thenReturn(order("aguardando_pagamento"));
        when(payments.findByIdempotencyKey("pedido-10-credit_card"))
                .thenReturn(Optional.of(morta));
        when(payments.findByIdempotencyKey("pedido-10-credit_card-r2"))
                .thenReturn(Optional.empty());
        when(provider.createCharge(any())).thenAnswer(inv -> {
            var req = (PaymentProvider.ChargeRequest) inv.getArgument(0);
            assertThat(req.idempotencyKey()).isEqualTo("pedido-10-credit_card-r2");
            return new PaymentProvider.ChargeResult("456-pref", PaymentStatus.PENDING,
                    "https://mp/link-novo", null, null, Instant.now().plusSeconds(1800),
                    Map.of());
        });

        Payment p = service.create(new PaymentService.CreatePaymentCommand(
                10L, PaymentMethod.CREDIT_CARD, null, "pedido-10-credit_card", null, null, null, null, null, null, null),
                portal, "jwt");

        assertThat(morta.getStatus()).isEqualTo(PaymentStatus.EXPIRED);
        assertThat(p.getCheckoutUrl()).isEqualTo("https://mp/link-novo");
        verify(provider).createCharge(any());
    }

    @Test
    void pedidoCanceladoNaoAceitaCobranca() {
        when(orderGateway.getOrder(10L, "jwt", true)).thenReturn(order("cancelado"));
        assertThatThrownBy(() -> service.create(new PaymentService.CreatePaymentCommand(
                10L, PaymentMethod.PIX, null, null, null, null, null, null, null, null, null), portal, "jwt"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("cancelado");
    }

    @Test
    void falhaDoProviderPropaga502SemPersistir() {
        when(orderGateway.getOrder(10L, "jwt", true)).thenReturn(order("aguardando_pagamento"));
        when(payments.findByIdempotencyKey(anyString())).thenReturn(Optional.empty());
        when(provider.createCharge(any())).thenThrow(new RuntimeException("timeout"));

        assertThatThrownBy(() -> service.create(new PaymentService.CreatePaymentCommand(
                10L, PaymentMethod.PIX, null, null, null, null, null, null, null, null, null), portal, "jwt"))
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).codigo()).isEqualTo("provedor_indisponivel"));
        verify(payments, never()).saveAndFlush(any());
    }

    @Test
    void pedidoJaConfirmadoNaoEmiteNovaCobranca() {
        when(orderGateway.getOrder(10L, "jwt", true)).thenReturn(order("aguardando_pagamento"));
        when(payments.existsByPedidoIdAndStatus(10L, PaymentStatus.CONFIRMED)).thenReturn(true);

        assertThatThrownBy(() -> service.create(new PaymentService.CreatePaymentCommand(
                10L, PaymentMethod.PIX, null, "chave-nova-qualquer", null, null, null, null, null, null, null), portal, "jwt"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("cobrança confirmada");
        verify(provider, never()).createCharge(any());
    }

    @Test
    void idempotencyKeyDeOutraEmpresaNaoVazaCobranca() {
        // Chave adivinhável apontando para cobrança de empresa 99 — o lookup
        // sem escopo de empresa devolveria o checkout/pix dela (IDOR).
        Payment alheio = new Payment(UUID.randomUUID(), 10L, 99L, 1L, "psp-teste",
                PaymentMethod.PIX, new BigDecimal("199.90"), "pedido-10-PIX-psp-teste", "portal", "1");
        when(orderGateway.getOrder(10L, "jwt", true)).thenReturn(order("aguardando_pagamento"));
        when(payments.findByIdempotencyKey("pedido-10-PIX-psp-teste")).thenReturn(Optional.of(alheio));

        assertThatThrownBy(() -> service.create(new PaymentService.CreatePaymentCommand(
                10L, PaymentMethod.PIX, null, null, null, null, null, null, null, null, null), portal, "jwt"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("outra empresa");
    }

    @Test
    void portalNaoSelecionaStub() {
        PaymentProvider stub = mock(PaymentProvider.class);
        when(stub.name()).thenReturn("stub");
        var props = new PaymentProperties("psp-teste", Map.of(), 30, false);
        var svc = new PaymentService(payments, transactions,
                new ProviderRegistry(List.of(provider, stub), props),
                orderGateway, outbox, audit, props);
        when(orderGateway.getOrder(10L, "jwt", true)).thenReturn(order("aguardando_pagamento"));

        assertThatThrownBy(() -> svc.create(new PaymentService.CreatePaymentCommand(
                10L, PaymentMethod.PIX, "stub", null, null, null, null, null, null, null, null), portal, "jwt"))
                .isInstanceOf(ApiException.class)
                .hasMessageContaining("indisponível");
        verify(stub, never()).createCharge(any());
    }

    @Test
    void cancelEmConfirmedRejeitadoAntesDoPsp() {
        // CONFIRMED → CANCELLED é inválido: o guarda precisa disparar ANTES do
        // provider — no PagBank, cancelCharge em cobrança paga é ESTORNO.
        Payment p = new Payment(UUID.randomUUID(), 10L, 7L, 42L, "psp-teste",
                PaymentMethod.PIX, new BigDecimal("199.90"), "k", "staff", "1");
        p.applyProviderResult("ext-1", null, null, null, null);
        p.transitionTo(PaymentStatus.CONFIRMED, null, null);
        when(payments.findById(p.getId())).thenReturn(Optional.of(p));

        assertThatThrownBy(() -> service.cancel(p.getId(), staff, "jwt"))
                .isInstanceOf(ApiException.class);
        verify(provider, never()).cancelCharge(anyString());
    }

    @Test
    void webhookConfirmadoTransicionaEPublica() {
        Payment p = new Payment(UUID.randomUUID(), 10L, 7L, 42L, "stub",
                PaymentMethod.PIX, new BigDecimal("199.90"), "k", "portal", "42");
        var parsed = new PaymentProvider.ParsedWebhook("evt-1", "stub_1",
                PaymentStatus.CONFIRMED, null, null, Instant.now(), null, Map.of());

        service.applyWebhookResult(p, parsed);

        assertThat(p.getStatus()).isEqualTo(PaymentStatus.CONFIRMED);
        verify(outbox).publish(anyString(), anyString(),
                org.mockito.ArgumentMatchers.argThat(e -> "PaymentConfirmed".equals(e.eventType())));
    }

    @Test
    void webhookEmEstadoJaAplicadoEhNoop() {
        Payment p = new Payment(UUID.randomUUID(), 10L, 7L, 42L, "stub",
                PaymentMethod.PIX, new BigDecimal("199.90"), "k", "portal", "42");
        p.applyProviderResult("stub_1", null, null, null, null);
        p.transitionTo(PaymentStatus.CONFIRMED, null, null);

        var parsed = new PaymentProvider.ParsedWebhook("evt-2", "stub_1",
                PaymentStatus.CONFIRMED, null, null, Instant.now(), null, Map.of());
        service.applyWebhookResult(p, parsed);

        verify(outbox, never()).publish(anyString(), anyString(), any());
    }
}
