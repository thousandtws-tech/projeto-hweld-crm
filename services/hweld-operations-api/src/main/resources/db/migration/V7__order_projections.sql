-- Projeção CQRS de pedidos do core-api (Rust) — alimentada pelo evento
-- OrderCreated via /api/v1/internal/events. Permite joins/agregações de
-- dashboard sem consultar o serviço irmão. Fonte de verdade segue no Rust.
CREATE TABLE order_projections (
    pedido_id          BIGINT PRIMARY KEY,
    public_id          UUID,
    numero             VARCHAR(32) NOT NULL,
    empresa_id         BIGINT NOT NULL,
    contato_id         BIGINT,
    total              NUMERIC(14,2) NOT NULL,
    status             VARCHAR(40) NOT NULL,
    origem             VARCHAR(20) NOT NULL,
    condicao_pagamento VARCHAR(60),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_projections_empresa ON order_projections (empresa_id);
CREATE INDEX idx_order_projections_status  ON order_projections (status);
CREATE INDEX idx_order_projections_origem  ON order_projections (origem);
