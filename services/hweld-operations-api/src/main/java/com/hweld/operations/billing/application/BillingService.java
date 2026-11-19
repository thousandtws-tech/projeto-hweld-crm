package com.hweld.operations.billing.application;

import com.hweld.operations.billing.domain.BillingInvoice;
import com.hweld.operations.billing.domain.BillingInvoiceRepository;
import com.hweld.operations.shared.application.EventTypes;
import com.hweld.operations.shared.application.IntegrationEvent;
import com.hweld.operations.shared.infrastructure.audit.AuditService;
import com.hweld.operations.shared.infrastructure.outbox.Outbox;
import com.hweld.operations.shared.interfaces.error.ApiException;
import com.hweld.operations.shared.interfaces.web.CorrelationIdFilter;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BillingService {

    private static final Logger log = LoggerFactory.getLogger(BillingService.class);

    private final BillingInvoiceRepository repository;
    private final Outbox outbox;
    private final AuditService audit;

    public BillingService(BillingInvoiceRepository repository, Outbox outbox, AuditService audit) {
        this.repository = repository;
        this.outbox = outbox;
        this.audit = audit;
    }

    @Transactional
    public BillingInvoice createFromPayment(UUID paymentId, long pedidoId, long empresaId,
            BigDecimal amount, String currency, LocalDate dueDate, String descricao) {
        var existente = repository.findByPaymentId(paymentId);
        if (existente.isPresent()) {
            return existente.get();
        }
        BillingInvoice invoice = new BillingInvoice(paymentId, pedidoId, empresaId,
                amount, currency, dueDate, descricao != null ? descricao : "Pedido " + pedidoId);
        repository.save(invoice);
        outbox.publish("billing_invoice", invoice.getId().toString(), IntegrationEvent.of(
                EventTypes.INVOICE_ISSUED, invoice.getId().toString(),
                Map.of("invoiceId", invoice.getId().toString(), "pedidoId", pedidoId,
                        "empresaId", empresaId, "amount", amount.toPlainString()),
                CorrelationIdFilter.current()));
        audit.record("billing.issued", "billing_invoice", invoice.getId().toString(),
                Map.of("pedidoId", pedidoId, "paymentId", paymentId.toString()));
        return invoice;
    }

    @Transactional
    public void markPaidByPayment(UUID paymentId) {
        repository.findByPaymentId(paymentId).ifPresent(invoice -> {
            if (invoice.status() == BillingInvoice.Status.PAID) return;
            invoice.markPaid(Instant.now());
            repository.save(invoice);
            outbox.publish("billing_invoice", invoice.getId().toString(), IntegrationEvent.of(
                    EventTypes.INVOICE_PAID, invoice.getId().toString(),
                    Map.of("invoiceId", invoice.getId().toString(),
                            "pedidoId", invoice.getPedidoId(), "empresaId", invoice.getEmpresaId()),
                    CorrelationIdFilter.current()));
        });
    }

    @Transactional
    public void cancelByPayment(UUID paymentId) {
        repository.findByPaymentId(paymentId).ifPresent(invoice -> {
            if (invoice.status() == BillingInvoice.Status.CANCELLED) return;
            try {
                invoice.cancel();
            } catch (IllegalStateException e) {
                return; 
            }
            repository.save(invoice);
            outbox.publish("billing_invoice", invoice.getId().toString(), IntegrationEvent.of(
                    EventTypes.INVOICE_CANCELLED, invoice.getId().toString(),
                    Map.of("invoiceId", invoice.getId().toString(),
                            "pedidoId", invoice.getPedidoId(), "empresaId", invoice.getEmpresaId()),
                    CorrelationIdFilter.current()));
        });
    }

    @Transactional(readOnly = true)
    public BillingInvoice get(UUID id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.naoEncontrado("fatura não encontrada"));
    }

    @Transactional(readOnly = true)
    public Page<BillingInvoice> list(Long pedidoId, String status, Pageable pageable) {
        if (pedidoId != null) return repository.findByPedidoId(pedidoId, pageable);
        if (status != null) return repository.findByStatus(status.toUpperCase(), pageable);
        return repository.findAll(pageable);
    }

    @Transactional
    public BillingInvoice cancel(UUID id) {
        BillingInvoice invoice = get(id);
        invoice.cancel();
        repository.save(invoice);
        audit.record("billing.cancelled", "billing_invoice", id.toString(), Map.of());
        return invoice;
    }

    @Scheduled(cron = "${hweld.billing.overdue-cron:0 15 6 * * *}") 
    @Transactional
    public void markOverdue() {
        var vencidas = repository.findByStatusAndDueDateBefore("OPEN", LocalDate.now());
        for (BillingInvoice inv : vencidas) {
            inv.markOverdue();
            repository.save(inv);
            outbox.publish("billing_invoice", inv.getId().toString(), IntegrationEvent.of(
                    EventTypes.INVOICE_OVERDUE, inv.getId().toString(),
                    Map.of("invoiceId", inv.getId().toString(), "pedidoId", inv.getPedidoId(),
                            "empresaId", inv.getEmpresaId()),
                    CorrelationIdFilter.current()));
        }
        if (!vencidas.isEmpty()) {
            log.info("billing: {} faturas marcadas OVERDUE", vencidas.size());
        }
    }
}
