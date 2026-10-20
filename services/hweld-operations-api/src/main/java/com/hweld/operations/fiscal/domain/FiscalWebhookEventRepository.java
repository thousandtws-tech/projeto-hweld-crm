package com.hweld.operations.fiscal.domain;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface FiscalWebhookEventRepository extends JpaRepository<FiscalWebhookEvent, UUID> {

    Optional<FiscalWebhookEvent> findByProviderAndEventKey(String provider, String eventKey);
}
