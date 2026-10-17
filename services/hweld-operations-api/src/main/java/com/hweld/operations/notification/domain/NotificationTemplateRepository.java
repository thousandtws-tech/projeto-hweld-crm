package com.hweld.operations.notification.domain;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NotificationTemplateRepository extends JpaRepository<NotificationTemplate, String> {

    Optional<NotificationTemplate> findByCodeAndActiveTrue(String code);
}
