package com.hweld.operations.billing.domain;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BillingInvoiceRepository extends JpaRepository<BillingInvoice, UUID> {

    Optional<BillingInvoice> findByPaymentId(UUID paymentId);

    Page<BillingInvoice> findByEmpresaId(Long empresaId, Pageable pageable);

    Page<BillingInvoice> findByStatus(String status, Pageable pageable);

    Page<BillingInvoice> findByPedidoId(Long pedidoId, Pageable pageable);

    List<BillingInvoice> findByStatusAndDueDateBefore(String status, LocalDate date);
}
