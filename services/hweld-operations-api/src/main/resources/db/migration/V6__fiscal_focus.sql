-- V2 — integração Focus NFe: tracking de ambiente/status do provedor,
-- histórico de eventos do documento e dedupe de webhooks fiscais.
--
-- Contratos (doc.focusnfe.com.br):
-- - `ref` é o identificador da emissão no provedor — UNIQUE por provider+env
--   para impedir emissão duplicada da mesma referência.
-- - webhook não traz event_id próprio: a deduplicação usa chave derivada
--   (ref + status + hash do payload).
-- - artefatos (XML/DANFE) são baixados do provedor e hospedados no object
--   storage interno — `xml_url`/`pdf_url` guardam a chave `fiscal/{id}.*`,
--   o caminho remoto permanece no `payload` para auditoria.

ALTER TABLE fiscal_documents
    ADD COLUMN environment      VARCHAR(20) NOT NULL DEFAULT 'homologacao'
                                CHECK (environment IN ('homologacao','producao')),
    ADD COLUMN provider_status  VARCHAR(60),
    ADD COLUMN status_detail    VARCHAR(500),
    ADD COLUMN numero           VARCHAR(20),
    ADD COLUMN serie            VARCHAR(10),
    ADD COLUMN last_sync_at     TIMESTAMPTZ,
    -- estados extras do ciclo de vida (CHECK recriado abaixo)
    DROP CONSTRAINT fiscal_documents_status_check;

ALTER TABLE fiscal_documents
    ADD CONSTRAINT fiscal_documents_status_check CHECK (status IN (
        'REQUESTED','PROCESSING','AUTHORIZED','REJECTED','CANCELLED',
        'CANCELLATION_PENDING','REQUIRES_RECONCILIATION','ERROR'));

-- `ref` única por provedor+ambiente: barreira contra emissão duplicada.
-- external_id pode ser NULL (falha antes do envio) — índice parcial.
CREATE UNIQUE INDEX fiscal_ref_uk
    ON fiscal_documents (provider, environment, external_id)
    WHERE external_id IS NOT NULL;

DROP INDEX IF EXISTS fiscal_external_uk;

CREATE INDEX fiscal_reconcile_idx ON fiscal_documents (provider, status, updated_at)
    WHERE status IN ('REQUESTED','PROCESSING','REQUIRES_RECONCILIATION','CANCELLATION_PENDING');

-- Histórico do ciclo de vida — emissão, transições, webhooks, reconciliação.
CREATE TABLE fiscal_document_events (
    id                 UUID PRIMARY KEY,
    fiscal_document_id UUID NOT NULL REFERENCES fiscal_documents (id) ON DELETE RESTRICT,
    event_type         TEXT NOT NULL
                       CHECK (event_type IN ('REQUESTED','SUBMITTED','STATUS_CHANGE',
                                             'WEBHOOK','RECONCILE','CANCEL','ERROR','ARTIFACT')),
    status_from        VARCHAR(40),
    status_to          VARCHAR(40),
    provider_status    VARCHAR(60),
    message            VARCHAR(500),
    payload            JSONB,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX fiscal_events_doc_idx    ON fiscal_document_events (fiscal_document_id, created_at);
CREATE INDEX fiscal_events_type_idx   ON fiscal_document_events (event_type, created_at);

-- Dedupe de webhooks fiscais recebidos (ex.: Focus NFe). `event_key` é
-- derivado (ref + status + hash do payload) — a linha é gravada antes do
-- processamento; violação da UNIQUE = entrega duplicada → 200 no-op.
CREATE TABLE fiscal_webhook_events (
    id                 UUID PRIMARY KEY,
    provider           VARCHAR(40) NOT NULL,
    event_key          VARCHAR(200) NOT NULL,
    fiscal_document_id UUID REFERENCES fiscal_documents (id) ON DELETE SET NULL,
    payload            JSONB NOT NULL,
    processing_result  VARCHAR(40),               -- PROCESSED|IGNORED|FAILED
    error_message      VARCHAR(400),
    received_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at       TIMESTAMPTZ,
    CONSTRAINT fiscal_webhook_event_uk UNIQUE (provider, event_key)
);
