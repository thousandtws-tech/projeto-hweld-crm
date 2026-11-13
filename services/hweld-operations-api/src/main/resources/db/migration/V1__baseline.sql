-- V1 — baseline do serviço business-operations (banco dedicado `hweld_ops`).
-- Convenções alinhadas ao core-api: dinheiro NUMERIC(14,2) + currency VARCHAR(3),
-- TIMESTAMPTZ, enums como TEXT + CHECK. Refs ao domínio do Rust são colunas
-- simples (sem FK cruzada entre serviços). IDs UUID: melhores para chaves de
-- idempotência e exposição em APIs/webhooks.

-- ── PAYMENTS ──────────────────────────────────────────────────────────────
CREATE TABLE payments (
    id               UUID PRIMARY KEY,
    pedido_id        BIGINT NOT NULL,              -- ref. pedidos (core-api)
    empresa_id       BIGINT NOT NULL,              -- ref. empresas (multi-tenant)
    contato_id       BIGINT,                       -- ref. contatos (portal)
    provider         VARCHAR(40) NOT NULL,
    method           TEXT NOT NULL CHECK (method IN ('PIX','CREDIT_CARD','BOLETO')),
    status           TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING','PROCESSING','CONFIRMED','FAILED','CANCELLED','REFUNDED','EXPIRED')),
    amount           NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    currency         VARCHAR(3) NOT NULL DEFAULT 'BRL',
    idempotency_key  VARCHAR(120) NOT NULL,
    external_id      VARCHAR(120),
    checkout_url     VARCHAR(600),
    pix_qr_code      TEXT,
    pix_copy_paste   TEXT,
    expires_at       TIMESTAMPTZ,
    failure_code     VARCHAR(60),
    failure_message  VARCHAR(400),
    created_by_type  TEXT NOT NULL CHECK (created_by_type IN ('staff','portal','service')),
    created_by_id    VARCHAR(80) NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    version          BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT payments_idempotency_uk UNIQUE (idempotency_key)
);

CREATE UNIQUE INDEX payments_external_uk ON payments (provider, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX payments_pedido_idx   ON payments (pedido_id);
CREATE INDEX payments_empresa_idx  ON payments (empresa_id);
CREATE INDEX payments_status_idx   ON payments (status);
CREATE INDEX payments_created_idx  ON payments (created_at DESC);

-- Trilha de transações do pagamento (charge, webhook, refund, cancel, reconcile)
CREATE TABLE payment_transactions (
    id            UUID PRIMARY KEY,
    payment_id    UUID NOT NULL REFERENCES payments (id) ON DELETE RESTRICT,
    type          TEXT NOT NULL
                  CHECK (type IN ('CHARGE_REQUESTED','CHARGE_CREATED','WEBHOOK','STATUS_CHANGE','REFUND','CANCEL','RECONCILE')),
    status_from   VARCHAR(20),
    status_to     VARCHAR(20) NOT NULL,
    amount        NUMERIC(14,2),
    currency      VARCHAR(3),
    external_id   VARCHAR(120),
    payload       JSONB,
    occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX payment_tx_payment_idx ON payment_transactions (payment_id, occurred_at);

-- Webhooks recebidos — dedupe por (provider, event_id)
CREATE TABLE payment_webhook_events (
    id                UUID PRIMARY KEY,
    provider          VARCHAR(40) NOT NULL,
    event_id          VARCHAR(160) NOT NULL,
    signature_valid   BOOLEAN NOT NULL,
    payment_id        UUID REFERENCES payments (id) ON DELETE SET NULL,
    payload           JSONB NOT NULL,
    processing_result VARCHAR(40),               -- PROCESSED|IGNORED|FAILED|DUPLICATED
    error_message     VARCHAR(400),
    received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at      TIMESTAMPTZ,
    CONSTRAINT webhook_event_uk UNIQUE (provider, event_id)
);

-- ── BILLING ───────────────────────────────────────────────────────────────
CREATE TABLE billing_invoices (
    id           UUID PRIMARY KEY,
    payment_id   UUID REFERENCES payments (id) ON DELETE SET NULL,
    pedido_id    BIGINT NOT NULL,
    empresa_id   BIGINT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'OPEN'
                 CHECK (status IN ('OPEN','PAID','OVERDUE','CANCELLED')),
    amount       NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    currency     VARCHAR(3) NOT NULL DEFAULT 'BRL',
    due_date     DATE,
    description  VARCHAR(300),
    paid_at      TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT billing_payment_uk UNIQUE (payment_id)
);
CREATE INDEX billing_pedido_idx  ON billing_invoices (pedido_id);
CREATE INDEX billing_empresa_idx ON billing_invoices (empresa_id);
CREATE INDEX billing_status_idx  ON billing_invoices (status);
CREATE INDEX billing_due_idx     ON billing_invoices (due_date) WHERE status = 'OPEN';

-- ── FISCAL ────────────────────────────────────────────────────────────────
-- Orquestração de emissão junto a provedor externo. O registro de negócio da
-- NF continua no core-api (notas_fiscais) — aqui fica o tracking do provedor.
CREATE TABLE fiscal_documents (
    id                UUID PRIMARY KEY,
    pedido_id         BIGINT NOT NULL,
    empresa_id        BIGINT NOT NULL,
    billing_invoice_id UUID REFERENCES billing_invoices (id) ON DELETE SET NULL,
    nota_fiscal_id    BIGINT,                       -- ref. notas_fiscais (core-api)
    doc_type          TEXT NOT NULL CHECK (doc_type IN ('NFE','NFSE')),
    provider          VARCHAR(40) NOT NULL,
    status            TEXT NOT NULL DEFAULT 'REQUESTED'
                      CHECK (status IN ('REQUESTED','PROCESSING','AUTHORIZED','REJECTED','CANCELLED')),
    external_id       VARCHAR(160),
    access_key        VARCHAR(44),
    protocol          VARCHAR(60),
    xml_url           VARCHAR(600),
    pdf_url           VARCHAR(600),
    rejection_reason  VARCHAR(500),
    payload           JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX fiscal_pedido_idx   ON fiscal_documents (pedido_id);
CREATE INDEX fiscal_empresa_idx  ON fiscal_documents (empresa_id);
CREATE INDEX fiscal_status_idx   ON fiscal_documents (status);
CREATE UNIQUE INDEX fiscal_external_uk ON fiscal_documents (provider, external_id) WHERE external_id IS NOT NULL;

-- ── NOTIFICATIONS ─────────────────────────────────────────────────────────
CREATE TABLE notification_templates (
    code        VARCHAR(60) PRIMARY KEY,
    channel     TEXT NOT NULL CHECK (channel IN ('EMAIL')),
    subject     VARCHAR(200) NOT NULL,
    body_html   TEXT NOT NULL,
    body_text   TEXT,
    locale      VARCHAR(10) NOT NULL DEFAULT 'pt-BR',
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    version     INT NOT NULL DEFAULT 1,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notification_deliveries (
    id            UUID PRIMARY KEY,
    template_code VARCHAR(60) REFERENCES notification_templates (code) ON DELETE SET NULL,
    channel       TEXT NOT NULL CHECK (channel IN ('EMAIL')),
    recipient     VARCHAR(200) NOT NULL,
    subject       VARCHAR(300) NOT NULL,
    status        TEXT NOT NULL DEFAULT 'QUEUED'
                  CHECK (status IN ('QUEUED','SENDING','SENT','FAILED','DEAD')),
    payload       JSONB,
    attempts      INT NOT NULL DEFAULT 0,
    next_retry_at TIMESTAMPTZ,
    last_error    VARCHAR(500),
    sent_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX deliveries_pending_idx ON notification_deliveries (status, next_retry_at)
    WHERE status IN ('QUEUED','FAILED');
CREATE INDEX deliveries_recipient_idx ON notification_deliveries (recipient);

-- ── OUTBOX / INBOX ────────────────────────────────────────────────────────
CREATE TABLE outbox_events (
    id             UUID PRIMARY KEY,
    aggregate_type VARCHAR(40) NOT NULL,
    aggregate_id   VARCHAR(80) NOT NULL,
    event_type     VARCHAR(80) NOT NULL,
    event_version  INT NOT NULL DEFAULT 1,
    correlation_id VARCHAR(80),
    payload        JSONB NOT NULL,
    status         TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (status IN ('PENDING','PUBLISHED','DEAD')),
    attempts       INT NOT NULL DEFAULT 0,
    next_retry_at  TIMESTAMPTZ,
    last_error     VARCHAR(500),
    occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at   TIMESTAMPTZ
);
CREATE INDEX outbox_pending_idx ON outbox_events (status, next_retry_at) WHERE status = 'PENDING';
CREATE INDEX outbox_aggregate_idx ON outbox_events (aggregate_type, aggregate_id);

CREATE TABLE processed_events (
    event_id     UUID NOT NULL,
    processor    VARCHAR(80) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT processed_events_pk PRIMARY KEY (event_id, processor)
);

-- ── AUDIT ─────────────────────────────────────────────────────────────────
CREATE TABLE audit_logs (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_type  TEXT NOT NULL CHECK (actor_type IN ('staff','portal','service','system')),
    actor_id    VARCHAR(80),
    action      VARCHAR(80) NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id   VARCHAR(80),
    details     JSONB,
    ip          VARCHAR(60),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx   ON audit_logs (entity_type, entity_id);
CREATE INDEX audit_created_idx  ON audit_logs (created_at DESC);
CREATE INDEX audit_actor_idx    ON audit_logs (actor_type, actor_id);
