package com.hweld.operations.fiscal.infrastructure;

import com.hweld.operations.fiscal.domain.FiscalWebhookEvent;
import com.hweld.operations.fiscal.domain.FiscalWebhookEventRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Dedupe de webhook fiscal em TX própria (REQUIRES_NEW) — mesmo padrão do
 * dedupe de pagamentos: a violação do UNIQUE (provider, event_key) aborta só
 * esta transação e o chamador decide o resultado. A linha gravada sobrevive
 * a rollback posterior (replay seguro).
 */
@Component
public class FiscalWebhookDedupe {

    private final FiscalWebhookEventRepository repository;

    public FiscalWebhookDedupe(FiscalWebhookEventRepository repository) {
        this.repository = repository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(FiscalWebhookEvent event) {
        repository.saveAndFlush(event);
    }
}
