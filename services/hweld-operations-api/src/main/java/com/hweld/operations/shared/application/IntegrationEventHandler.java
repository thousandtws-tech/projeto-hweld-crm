package com.hweld.operations.shared.application;

/**
 * Consumidor de eventos da outbox — cada handler tem nome único usado como
 * chave de deduplicação em `processed_events` (processamento idempotente).
 * Handlers são executados pelo relay; uma exceção sinaliza falha e o evento
 * é reprocessado apenas para os handlers que ainda não constam como processados.
 */
public interface IntegrationEventHandler {

    /** Nome estável do handler — compõe a PK de `processed_events`. */
    String name();

    boolean supports(String eventType);

    void handle(IntegrationEvent event) throws Exception;
}
