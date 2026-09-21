-- 0001 — Extensões, módulo de acesso, formas de pagamento, tokens, sequências de documentos.
-- Convenções (docs/modelo-de-dados.md):
--   * ids BIGINT identity; documentos recebem `numero` legível gerado por SEQUENCE
--   * dinheiro NUMERIC(14,2); quantidades NUMERIC(14,3)
--   * enums como TEXT + CHECK (evolutivo, sem ALTER TYPE em produção)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Sequências para números legíveis de documentos ─────────────────────────
CREATE SEQUENCE orcamento_numero_seq START 1;
CREATE SEQUENCE pedido_numero_seq    START 1;
CREATE SEQUENCE os_numero_seq        START 1;
CREATE SEQUENCE nf_numero_seq        START 1;

-- ── usuarios — equipe interna ──────────────────────────────────────────────
CREATE TABLE usuarios (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome        VARCHAR(120) NOT NULL,
    email       VARCHAR(160) NOT NULL,
    senha_hash  VARCHAR(255) NOT NULL,
    perfil      TEXT NOT NULL CHECK (perfil IN ('admin','vendedor','financeiro','estoque','tecnico')),
    ativo       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT usuarios_email_uk UNIQUE (email)
);

CREATE INDEX usuarios_perfil_idx ON usuarios (perfil) WHERE ativo;

-- ── formas_pagamento — domínio financeiro ──────────────────────────────────
CREATE TABLE formas_pagamento (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome                 VARCHAR(60) NOT NULL,
    ativo                BOOLEAN NOT NULL DEFAULT TRUE,
    permite_parcelamento BOOLEAN NOT NULL DEFAULT FALSE,
    max_parcelas         INT NOT NULL DEFAULT 1 CHECK (max_parcelas >= 1),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT formas_pagamento_nome_uk UNIQUE (nome)
);

INSERT INTO formas_pagamento (nome, permite_parcelamento, max_parcelas) VALUES
    ('PIX',               FALSE, 1),
    ('Boleto',            TRUE,  12),
    ('Cartão Crédito',    TRUE,  12),
    ('Cartão Débito',     FALSE, 1),
    ('Transferência',     FALSE, 1),
    ('Dinheiro',          FALSE, 1);

-- ── refresh_tokens — revogação/rotação de sessões (staff + portal) ─────────
-- Extensão justificada: o modelo de dados é lógico; JWT puro não permite logout.
CREATE TABLE refresh_tokens (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_type  TEXT NOT NULL CHECK (owner_type IN ('staff','portal')),
    owner_id    BIGINT NOT NULL,
    token_hash  VARCHAR(128) NOT NULL,           -- SHA-256 do token opaco
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT refresh_tokens_hash_uk UNIQUE (token_hash)
);

CREATE INDEX refresh_tokens_owner_idx ON refresh_tokens (owner_type, owner_id) WHERE revoked_at IS NULL;
