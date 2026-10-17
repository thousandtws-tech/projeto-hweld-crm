package com.hweld.operations.shared.infrastructure.outbox;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "processed_events")
@IdClass(ProcessedEventEntity.Key.class)
public class ProcessedEventEntity {

    public static class Key implements Serializable {
        private UUID eventId;
        private String processor;

        public Key() {}
        public Key(UUID eventId, String processor) {
            this.eventId = eventId;
            this.processor = processor;
        }
        @Override public boolean equals(Object o) {
            return o instanceof Key k && Objects.equals(eventId, k.eventId) && Objects.equals(processor, k.processor);
        }
        @Override public int hashCode() { return Objects.hash(eventId, processor); }
    }

    @Id
    @Column(name = "event_id")
    private UUID eventId;

    @Id
    @Column(name = "processor", length = 80)
    private String processor;

    @Column(name = "processed_at", nullable = false)
    private Instant processedAt = Instant.now();

    protected ProcessedEventEntity() {}

    public ProcessedEventEntity(UUID eventId, String processor) {
        this.eventId = eventId;
        this.processor = processor;
    }
}
