package com.hweld.operations.fiscal.domain;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FiscalDocumentRepository extends JpaRepository<FiscalDocument, UUID> {

    Page<FiscalDocument> findByPedidoId(Long pedidoId, Pageable pageable);

    Page<FiscalDocument> findByStatus(String status, Pageable pageable);

    Page<FiscalDocument> findByEmpresaId(Long empresaId, Pageable pageable);

    Page<FiscalDocument> findByProviderOrderByCreatedAtDesc(String provider, Pageable pageable);

    Optional<FiscalDocument> findByProviderAndExternalId(String provider, String externalId);

    /** Documentos aguardando resolução no provedor (reconciliação/webhook). */
    List<FiscalDocument> findTop50ByStatusInOrderByUpdatedAtAsc(List<String> statuses);
}
