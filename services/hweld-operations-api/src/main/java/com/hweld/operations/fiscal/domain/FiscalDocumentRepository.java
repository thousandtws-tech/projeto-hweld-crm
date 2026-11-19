package com.hweld.operations.fiscal.domain;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FiscalDocumentRepository extends JpaRepository<FiscalDocument, UUID> {

    Page<FiscalDocument> findByPedidoId(Long pedidoId, Pageable pageable);

    /** Dedup de emissão sem janela: documento vivo do pedido, do tipo dado. */
    @org.springframework.data.jpa.repository.Query("""
            SELECT d FROM FiscalDocument d
            WHERE d.pedidoId = :pedidoId AND d.docType = :docType AND d.status IN :statuses
            ORDER BY d.createdAt DESC
            """)
    java.util.List<FiscalDocument> findAtivosPorPedidoEDocType(
            @org.springframework.data.repository.query.Param("pedidoId") Long pedidoId,
            @org.springframework.data.repository.query.Param("docType") String docType,
            @org.springframework.data.repository.query.Param("statuses") java.util.List<String> statuses);

    Page<FiscalDocument> findByStatus(String status, Pageable pageable);

    Page<FiscalDocument> findByEmpresaId(Long empresaId, Pageable pageable);

    Page<FiscalDocument> findByProviderOrderByCreatedAtDesc(String provider, Pageable pageable);

    Optional<FiscalDocument> findByProviderAndExternalId(String provider, String externalId);

    List<FiscalDocument> findTop50ByStatusInOrderByUpdatedAtAsc(List<String> statuses);
}
