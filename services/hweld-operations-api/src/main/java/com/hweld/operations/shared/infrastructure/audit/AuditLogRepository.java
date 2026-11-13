package com.hweld.operations.shared.infrastructure.audit;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuditLogRepository extends JpaRepository<AuditLogEntity, Long> {

    Page<AuditLogEntity> findByEntityTypeOrderByIdDesc(String entityType, Pageable pageable);
}
