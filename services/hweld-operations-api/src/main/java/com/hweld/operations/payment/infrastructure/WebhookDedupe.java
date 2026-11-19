package com.hweld.operations.payment.infrastructure;

import com.hweld.operations.payment.domain.WebhookEventRecord;
import com.hweld.operations.payment.domain.WebhookEventRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Dedupe de webhook em transação própria (REQUIRES_NEW): a violação do
 * UNIQUE (provider, event_id) aborta apenas ESTA transação — a TX
 * chamadora segue intacta. A exceção NÃO é capturada aqui: engoli-la
 * deixaria a TX interna rollback-only e o commit lançaria
 * UnexpectedRollbackException no retorno. Quem chama captura
 * DataIntegrityViolationException e responde DUPLICATE. A linha gravada
 * sobrevive a rollback posterior (o webhook foi recebido — replay seguro).
 */
@Component
public class WebhookDedupe {

    private final WebhookEventRepository repository;

    public WebhookDedupe(WebhookEventRepository repository) {
        this.repository = repository;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(WebhookEventRecord record) {
        repository.saveAndFlush(record);
    }

    /**
     * Libera o evento quando o processamento falhou: o PSP vai reenviar e o
     * retry precisa poder processar de novo — sem isto a linha commitada faz o
     * reenvio responder DUPLICATE para sempre (evento envenenado).
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void release(String provider, String eventId) {
        repository.deleteByProviderAndEventId(provider, eventId);
    }
}
