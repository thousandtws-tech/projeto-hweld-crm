-- 0003 — CRM: empresas, endereços, contatos, oportunidades, interações, orçamentos.
-- NOTA: orcamentos.convertido_pedido_id recebe sua FK em 0004 (FK circular com pedidos).

CREATE TABLE empresas (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    razao_social       VARCHAR(200) NOT NULL,
    nome_fantasia      VARCHAR(200),
    cnpj               VARCHAR(14),
    inscricao_estadual VARCHAR(20),
    segmento           VARCHAR(80),
    telefone           VARCHAR(20),
    email              VARCHAR(160),
    site               VARCHAR(200),
    status             TEXT NOT NULL DEFAULT 'prospecto'
                       CHECK (status IN ('prospecto','ativo','inativo')),
    tabela_preco_id    BIGINT REFERENCES tabelas_preco (id) ON DELETE SET NULL,
    observacoes        TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at         TIMESTAMPTZ,
    CONSTRAINT empresas_cnpj_uk UNIQUE (cnpj)
);

CREATE INDEX empresas_status_idx  ON empresas (status) WHERE deleted_at IS NULL;
CREATE INDEX empresas_razao_idx   ON empresas (razao_social);

CREATE TABLE enderecos (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa_id   BIGINT NOT NULL REFERENCES empresas (id) ON DELETE CASCADE,
    tipo         TEXT NOT NULL CHECK (tipo IN ('fiscal','entrega','correspondencia')),
    logradouro   VARCHAR(200),
    numero       VARCHAR(20),
    complemento  VARCHAR(100),
    bairro       VARCHAR(100),
    cidade       VARCHAR(100) NOT NULL,
    uf           CHAR(2)     NOT NULL,
    cep          CHAR(8)     NOT NULL,
    pais         VARCHAR(60) NOT NULL DEFAULT 'Brasil',
    principal    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX enderecos_empresa_idx ON enderecos (empresa_id);

CREATE TABLE contatos (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa_id    BIGINT NOT NULL REFERENCES empresas (id) ON DELETE CASCADE,
    nome          VARCHAR(120) NOT NULL,
    cargo         VARCHAR(80),
    email         VARCHAR(160),
    telefone      VARCHAR(20),
    whatsapp      VARCHAR(20),
    is_principal  BOOLEAN NOT NULL DEFAULT FALSE,
    acesso_portal BOOLEAN NOT NULL DEFAULT FALSE,
    senha_hash    VARCHAR(255),
    observacoes   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ
);

CREATE INDEX contatos_empresa_idx ON contatos (empresa_id);
CREATE INDEX contatos_email_idx   ON contatos (email) WHERE deleted_at IS NULL AND acesso_portal;

CREATE TABLE oportunidades (
    id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa_id               BIGINT NOT NULL REFERENCES empresas (id)  ON DELETE RESTRICT,
    contato_id               BIGINT REFERENCES contatos (id)           ON DELETE SET NULL,
    responsavel_id           BIGINT NOT NULL REFERENCES usuarios (id)  ON DELETE RESTRICT,
    titulo                   VARCHAR(160) NOT NULL,
    descricao                TEXT,
    origem                   TEXT CHECK (origem IN ('ecommerce','indicacao','prospeccao','site','telefone','outro')),
    estagio                  TEXT NOT NULL
                             CHECK (estagio IN ('lead','qualificacao','proposta','negociacao','ganha','perdida')),
    valor_estimado           NUMERIC(14,2),
    data_prevista_fechamento DATE,
    motivo_perda             VARCHAR(300),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT oportunidades_motivo_perda_ck
        CHECK (estagio <> 'perdida' OR motivo_perda IS NOT NULL)
);

CREATE INDEX oportunidades_empresa_idx     ON oportunidades (empresa_id);
CREATE INDEX oportunidades_estagio_idx     ON oportunidades (estagio);
CREATE INDEX oportunidades_responsavel_idx ON oportunidades (responsavel_id);

CREATE TABLE interacoes (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empresa_id      BIGINT NOT NULL REFERENCES empresas (id)       ON DELETE CASCADE,
    contato_id      BIGINT REFERENCES contatos (id)                ON DELETE SET NULL,
    oportunidade_id BIGINT REFERENCES oportunidades (id)           ON DELETE SET NULL,
    usuario_id      BIGINT REFERENCES usuarios (id)                ON DELETE SET NULL,
    tipo            TEXT NOT NULL
                    CHECK (tipo IN ('ligacao','email','whatsapp','reuniao','visita','nota_interna','outro')),
    assunto         VARCHAR(200),
    descricao       TEXT,
    ocorrido_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    proxima_acao    VARCHAR(300),
    proxima_acao_em TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX interacoes_empresa_idx      ON interacoes (empresa_id, ocorrido_em DESC);
CREATE INDEX interacoes_oportunidade_idx ON interacoes (oportunidade_id);
CREATE INDEX interacoes_followup_idx     ON interacoes (proxima_acao_em) WHERE proxima_acao_em IS NOT NULL;

CREATE TABLE orcamentos (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero               VARCHAR(20) NOT NULL,
    empresa_id           BIGINT NOT NULL REFERENCES empresas (id)       ON DELETE RESTRICT,
    contato_id           BIGINT REFERENCES contatos (id)                ON DELETE SET NULL,
    oportunidade_id      BIGINT REFERENCES oportunidades (id)           ON DELETE SET NULL,
    vendedor_id          BIGINT NOT NULL REFERENCES usuarios (id)       ON DELETE RESTRICT,
    status               TEXT NOT NULL
                         CHECK (status IN ('rascunho','enviado','em_analise','aprovado','recusado','expirado','convertido')),
    emitido_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
    valido_ate           DATE,
    subtotal             NUMERIC(14,2) NOT NULL DEFAULT 0,
    desconto             NUMERIC(14,2) NOT NULL DEFAULT 0,
    frete                NUMERIC(14,2) NOT NULL DEFAULT 0,
    total                NUMERIC(14,2) NOT NULL DEFAULT 0,
    condicao_pagamento   VARCHAR(200),
    observacoes          TEXT,
    convertido_pedido_id BIGINT,   -- FK adicionada em 0004 após criar pedidos
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT orcamentos_numero_uk UNIQUE (numero)
);

CREATE INDEX orcamentos_empresa_idx      ON orcamentos (empresa_id);
CREATE INDEX orcamentos_status_idx       ON orcamentos (status);
CREATE INDEX orcamentos_oportunidade_idx ON orcamentos (oportunidade_id);

CREATE TABLE orcamento_itens (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    orcamento_id   BIGINT NOT NULL REFERENCES orcamentos (id) ON DELETE CASCADE,
    produto_id     BIGINT NOT NULL REFERENCES produtos (id)   ON DELETE RESTRICT,
    descricao      VARCHAR(300) NOT NULL,          -- snapshot
    quantidade     NUMERIC(14,3) NOT NULL CHECK (quantidade > 0),
    preco_unitario NUMERIC(14,2) NOT NULL,         -- snapshot B2B
    desconto       NUMERIC(14,2) NOT NULL DEFAULT 0,
    total          NUMERIC(14,2) NOT NULL
);

CREATE INDEX orcamento_itens_orcamento_idx ON orcamento_itens (orcamento_id);
