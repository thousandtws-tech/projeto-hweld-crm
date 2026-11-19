package com.hweld.operations.payment.domain;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WebhookEventRepository extends JpaRepository<WebhookEventRecord, UUID> {

    boolean existsByProviderAndEventId(String provider, String eventId);

    java.util.Optional<WebhookEventRecord> findByProviderAndEventId(String provider, String eventId);

    void deleteByProviderAndEventId(String provider, String eventId);

    java.util.List<WebhookEventRecord> findTop100ByProviderOrderByReceivedAtDesc(String provider);
}
