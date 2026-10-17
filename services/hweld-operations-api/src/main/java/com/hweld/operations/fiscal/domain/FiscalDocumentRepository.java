package com.hweld.operations.fiscal.domain;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FiscalDocumentRepository extends JpaRepository<FiscalDocument, UUID> {

    Page<FiscalDocument> findByPedidoId(Long pedidoId, Pageable pageable);

    Page<FiscalDocument> findByStatus(String status, Pageable pageable);

    Page<FiscalDocument> findByEmpresaId(Long empresaId, Pageable pageable);

    Optional<FiscalDocument> findByProviderAndExternalId(String provider, String externalId);
}
