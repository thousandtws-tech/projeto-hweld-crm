package com.hweld.operations.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.hweld.operations.billing.application.BillingService;
import com.hweld.operations.billing.domain.BillingInvoice;
import com.hweld.operations.billing.domain.BillingInvoiceRepository;
import com.hweld.operations.shared.infrastructure.audit.AuditService;
import com.hweld.operations.shared.infrastructure.outbox.Outbox;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class BillingServiceTest {

    private BillingInvoiceRepository repository;
    private Outbox outbox;
    private AuditService audit;
    private BillingService service;

    @BeforeEach
    void setUp() {
        repository = mock(BillingInvoiceRepository.class);
        outbox = mock(Outbox.class);
        audit = mock(AuditService.class);
        service = new BillingService(repository, outbox, audit);
    }

    @Test
    void criaFaturaDoPaymentRequested() {
        when(repository.findByPaymentId(any())).thenReturn(Optional.empty());
        UUID paymentId = UUID.randomUUID();

        BillingInvoice inv = service.createFromPayment(paymentId, 10L, 7L,
                new BigDecimal("250.00"), "BRL", LocalDate.now().plusDays(1), "Pedido 10");

        assertThat(inv.getStatus()).isEqualTo("OPEN");
        assertThat(inv.getPedidoId()).isEqualTo(10L);
        verify(outbox).publish(anyString(), anyString(), any());
    }

    @Test
    void criacaoDuplicadaRetornaExistente() {
        UUID paymentId = UUID.randomUUID();
        BillingInvoice inv = new BillingInvoice(paymentId, 10L, 7L,
                new BigDecimal("250.00"), "BRL", LocalDate.now(), "d");
        when(repository.findByPaymentId(paymentId)).thenReturn(Optional.of(inv));

        assertThat(service.createFromPayment(paymentId, 10L, 7L,
                new BigDecimal("250.00"), "BRL", LocalDate.now(), "d")).isSameAs(inv);
        verify(repository, never()).save(any());
    }

    @Test
    void baixaNoPaymentConfirmed() {
        UUID paymentId = UUID.randomUUID();
        BillingInvoice inv = new BillingInvoice(paymentId, 10L, 7L,
                new BigDecimal("250.00"), "BRL", LocalDate.now(), "d");
        when(repository.findByPaymentId(paymentId)).thenReturn(Optional.of(inv));

        service.markPaidByPayment(paymentId);

        assertThat(inv.getStatus()).isEqualTo("PAID");
        assertThat(inv.getPaidAt()).isNotNull();
        verify(outbox).publish(anyString(), anyString(), any());
    }

    @Test
    void baixaEmFaturaJaPagaEhNoop() {
        UUID paymentId = UUID.randomUUID();
        BillingInvoice inv = new BillingInvoice(paymentId, 10L, 7L,
                new BigDecimal("250.00"), "BRL", LocalDate.now(), "d");
        inv.markPaid(java.time.Instant.now());
        when(repository.findByPaymentId(paymentId)).thenReturn(Optional.of(inv));

        service.markPaidByPayment(paymentId);
        verify(outbox, never()).publish(anyString(), anyString(), any());
    }
}
