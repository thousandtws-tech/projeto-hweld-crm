-- Integração service-to-service (hweld-operations-api → core-api).
-- `eventos_integracao` é a inbox de deduplicação: o endpoint interno insere o
-- event_id antes de processar — entrega duplicada vira no-op seguro (o relay
-- da outbox Java reentrega em falha, então a garantia é at-least-once).

CREATE TABLE eventos_integracao (
    event_id      UUID        PRIMARY KEY,
    tipo          TEXT        NOT NULL,
    aggregate_id  TEXT        NOT NULL DEFAULT '',
    resultado     TEXT        NOT NULL,              -- processado | ignorado
    recebido_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_eventos_integracao_tipo ON eventos_integracao (tipo, recebido_em DESC);
