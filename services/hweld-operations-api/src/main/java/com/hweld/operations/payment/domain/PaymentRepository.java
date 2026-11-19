package com.hweld.operations.payment.domain;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentRepository extends JpaRepository<Payment, UUID> {

    Optional<Payment> findByIdempotencyKey(String idempotencyKey);

    Optional<Payment> findByProviderAndExternalId(String provider, String externalId);

    Page<Payment> findByEmpresaId(Long empresaId, Pageable pageable);

    Page<Payment> findByEmpresaIdAndStatus(Long empresaId, PaymentStatus status, Pageable pageable);

    Page<Payment> findByStatus(PaymentStatus status, Pageable pageable);

    Page<Payment> findByPedidoId(Long pedidoId, Pageable pageable);

    Page<Payment> findByProvider(String provider, Pageable pageable);
}
