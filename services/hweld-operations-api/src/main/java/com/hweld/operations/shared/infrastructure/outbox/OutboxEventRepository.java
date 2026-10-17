package com.hweld.operations.shared.infrastructure.outbox;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OutboxEventRepository extends JpaRepository<OutboxEventEntity, UUID> {

    @Query("""
            SELECT e FROM OutboxEventEntity e
            WHERE e.status = 'PENDING' AND (e.nextRetryAt IS NULL OR e.nextRetryAt <= :now)
            ORDER BY e.occurredAt
            """)
    List<OutboxEventEntity> findPending(@Param("now") Instant now, Pageable pageable);

    @Query("""
            SELECT e FROM OutboxEventEntity e
            WHERE (:status IS NULL OR e.status = :status)
              AND (:eventType IS NULL OR e.eventType = :eventType)
            ORDER BY e.occurredAt DESC
            """)
    Page<OutboxEventEntity> search(@Param("status") String status,
            @Param("eventType") String eventType, Pageable pageable);
}
