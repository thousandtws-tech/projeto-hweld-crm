-- V11 — Melhor Envio (logística): config genérica em `integration_settings`
-- (campos que não cabem nas colunas tipadas — ex.: cep_origem, serviços) e
-- histórico de cotações de frete. Credenciais seguem o padrão cliente:
-- Bearer token cifrado em `api_key_enc`, ambiente em `base_url`.

ALTER TABLE integration_settings
    ADD COLUMN IF NOT EXISTS config JSONB;

-- Cada cotação executada fica registrada — auditoria, histórico do painel e
-- base para futuras decisões de contratação (compra de frete = fase B).
CREATE TABLE logistics_quotes (
    id               UUID PRIMARY KEY,
    provider         VARCHAR(30) NOT NULL,
    pedido_id        BIGINT,
    empresa_id       BIGINT,
    cep_origem       VARCHAR(9)  NOT NULL,
    cep_destino      VARCHAR(9)  NOT NULL,
    status           VARCHAR(20) NOT NULL CHECK (status IN ('OK', 'ERRO')),
    erro             TEXT,
    servicos_count   INTEGER     NOT NULL DEFAULT 0,
    payload_request  JSONB       NOT NULL,
    payload_response JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX logistics_quotes_created_idx ON logistics_quotes (created_at DESC);
CREATE INDEX logistics_quotes_pedido_idx  ON logistics_quotes (pedido_id)
    WHERE pedido_id IS NOT NULL;
