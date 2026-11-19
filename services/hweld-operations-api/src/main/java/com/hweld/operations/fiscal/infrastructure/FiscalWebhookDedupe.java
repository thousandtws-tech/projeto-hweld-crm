package com.hweld.operations.fiscal.infrastructure;

import com.hweld.operations.fiscal.domain.FiscalWebhookEvent;
import com.hweld.operations.fiscal.domain.FiscalWebhookEventRepository;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

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

    /**
     * Libera o evento quando o processamento falhou: o reenvio do PSP precisa
     * poder processar de novo — sem isto a linha commitada responderia
     * DUPLICATE para sempre e a NF travaria (evento envenenado).
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void release(String provider, String eventKey) {
        repository.deleteByProviderAndEventKey(provider, eventKey);
    }
}
