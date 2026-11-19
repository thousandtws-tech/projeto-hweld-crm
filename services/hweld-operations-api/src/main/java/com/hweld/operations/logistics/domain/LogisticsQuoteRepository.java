package com.hweld.operations.logistics.domain;

import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LogisticsQuoteRepository extends JpaRepository<LogisticsQuote, UUID> {

    Page<LogisticsQuote> findByPedidoId(Long pedidoId, Pageable pageable);

    Page<LogisticsQuote> findByEmpresaId(Long empresaId, Pageable pageable);
}
