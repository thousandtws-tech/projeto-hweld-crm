-- Outbox de sincronização do índice de busca (Elasticsearch).
-- Indexações/remoções que falham no caminho best-effort viram linhas aqui
-- e um relay reprocessa com backoff quadrático até DEAD (8 tentativas).
-- O Postgres segue fonte de verdade; `reindexar` continua o reparo total.
CREATE TABLE busca_pendentes (
    id            BIGSERIAL PRIMARY KEY,
    produto_id    BIGINT NOT NULL,
    operacao      TEXT NOT NULL CHECK (operacao IN ('indexar', 'remover')),
    tentativas    INT NOT NULL DEFAULT 0,
    proximo_retry TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultimo_erro   TEXT,
    morto         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_busca_pendentes_due
    ON busca_pendentes (proximo_retry)
    WHERE morto = FALSE;
