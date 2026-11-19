package com.hweld.operations.fiscal.domain;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FiscalWebhookEventRepository extends JpaRepository<FiscalWebhookEvent, UUID> {

    Optional<FiscalWebhookEvent> findByProviderAndEventKey(String provider, String eventKey);

    Page<FiscalWebhookEvent> findByProviderOrderByReceivedAtDesc(
            String provider, Pageable pageable);
}
