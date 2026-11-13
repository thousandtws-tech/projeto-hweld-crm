package com.hweld.operations.notification.domain;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NotificationDeliveryRepository extends JpaRepository<NotificationDelivery, UUID> {

    @Query("""
            SELECT d FROM NotificationDelivery d
            WHERE d.status IN ('QUEUED','FAILED')
              AND (d.nextRetryAt IS NULL OR d.nextRetryAt <= :now)
            ORDER BY d.createdAt
            """)
    List<NotificationDelivery> findDispatchable(@Param("now") Instant now, Pageable pageable);

    Page<NotificationDelivery> findByRecipientOrderByCreatedAtDesc(String recipient, Pageable pageable);

    Page<NotificationDelivery> findByStatusOrderByCreatedAtDesc(String status, Pageable pageable);
}
