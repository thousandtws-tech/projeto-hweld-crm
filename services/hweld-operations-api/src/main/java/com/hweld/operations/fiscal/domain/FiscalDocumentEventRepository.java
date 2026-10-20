package com.hweld.operations.fiscal.domain;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FiscalDocumentEventRepository extends JpaRepository<FiscalDocumentEvent, UUID> {

    List<FiscalDocumentEvent> findByFiscalDocumentIdOrderByCreatedAtAsc(UUID fiscalDocumentId);
}
