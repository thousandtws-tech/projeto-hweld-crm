package com.hweld.operations.shared.infrastructure.outbox;

import com.hweld.operations.shared.application.IntegrationEvent;
import com.hweld.operations.shared.application.IntegrationEventHandler;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.ThreadLocalRandom;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * Relay da outbox: a cada poll, busca eventos PENDING e despacha para os
 * handlers que suportam o tipo. Idempotência por handler via `processed_events`
 * — um handler que falhou é reexecutado sem reenviar os que já processaram.
 * Após `maxAttempts` o evento vai a DEAD (dead-letter para intervenção manual).
 */
@Component
public class OutboxRelay {

    private static final Logger log = LoggerFactory.getLogger(OutboxRelay.class);

    @ConfigurationProperties(prefix = "hweld.outbox")
    public record Props(long pollIntervalMs, int batchSize, int maxAttempts) {
        public Props {
            if (pollIntervalMs <= 0) pollIntervalMs = 2000;
            if (batchSize <= 0) batchSize = 50;
            if (maxAttempts <= 0) maxAttempts = 8;
        }
    }

    private final OutboxEventRepository outbox;
    private final ProcessedEventRepository processed;
    private final List<IntegrationEventHandler> handlers;
    private final TransactionTemplate tx;
    private final Props props;

    public OutboxRelay(OutboxEventRepository outbox, ProcessedEventRepository processed,
            List<IntegrationEventHandler> handlers, PlatformTransactionManager txm, Props props) {
        this.outbox = outbox;
        this.processed = processed;
        this.handlers = handlers;
        this.props = props;
        this.tx = new TransactionTemplate(txm);
    }

    @Scheduled(fixedDelayString = "${hweld.outbox.poll-interval-ms:2000}", initialDelay = 3000)
    public void poll() {
        List<OutboxEventEntity> batch = outbox.findPending(Instant.now(), PageRequest.of(0, props.batchSize()));
        for (OutboxEventEntity row : batch) {
            try {
                dispatch(row);
            } catch (Exception e) {
                log.error("outbox: falha inesperada no dispatch eventId={}", row.getId(), e);
            }
        }
    }

    private void dispatch(OutboxEventEntity row) {
        List<IntegrationEventHandler> targets = handlers.stream()
                .filter(h -> h.supports(row.getEventType()))
                .toList();

        IntegrationEvent event = new IntegrationEvent(
                row.getId(), row.getEventType(), row.getEventVersion(),
                row.getAggregateId(), row.getCorrelationId(), row.getOccurredAt(), row.getPayload());

        StringBuilder errors = new StringBuilder();
        for (IntegrationEventHandler handler : targets) {
            if (processed.existsByEventIdAndProcessor(row.getId(), handler.name())) {
                continue;
            }
            try {
                tx.executeWithoutResult(status -> {
                    try {
                        handler.handle(event);
                    } catch (Exception e) {
                        throw new HandlerCallException(e);
                    }
                    processed.save(new ProcessedEventEntity(row.getId(), handler.name()));
                });
            } catch (HandlerCallException e) {
                log.warn("outbox: handler {} falhou no evento {} ({}): {}",
                        handler.name(), row.getId(), row.getEventType(), e.getCause().getMessage());
                errors.append(handler.name()).append(": ").append(e.getCause().getMessage()).append("; ");
            }
        }

        if (errors.isEmpty()) {
            tx.executeWithoutResult(s -> {
                row.markPublished();
                outbox.save(row);
            });
            log.info("evento despachado: {} ({}) → {}",
                    row.getEventType(), row.getId(),
                    targets.isEmpty() ? "sem handler"
                            : targets.stream().map(IntegrationEventHandler::name).toList());
        } else {
            tx.executeWithoutResult(s -> {
                if (row.getAttempts() + 1 >= props.maxAttempts()) {
                    row.markDead(errors.toString());
                    log.error("outbox: evento {} ({}) DEAD após {} tentativas: {}",
                            row.getId(), row.getEventType(), row.getAttempts() + 1, errors);
                } else {
                    row.markRetry(errors.toString(), nextRetry(row.getAttempts() + 1));
                }
                outbox.save(row);
            });
        }
    }

    /** Backoff exponencial com jitter: base 2s, teto 5min. */
    private Instant nextRetry(int attempt) {
        long baseMs = 2000L * (1L << Math.min(attempt, 8));
        long jitter = ThreadLocalRandom.current().nextLong(baseMs / 4 + 1);
        return Instant.now().plusMillis(Math.min(baseMs + jitter, Duration.ofMinutes(5).toMillis()));
    }

    private static final class HandlerCallException extends RuntimeException {
        HandlerCallException(Throwable cause) { super(cause); }
    }
}
