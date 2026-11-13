package com.hweld.operations.shared.infrastructure.outbox;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProcessedEventRepository extends JpaRepository<ProcessedEventEntity, ProcessedEventEntity.Key> {

    boolean existsByEventIdAndProcessor(UUID eventId, String processor);
}
