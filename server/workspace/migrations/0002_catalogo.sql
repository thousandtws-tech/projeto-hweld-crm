-- 0002 — Catálogo: tabelas de preço, categorias (árvore), produtos, imagens.

CREATE TABLE tabelas_preco (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome        VARCHAR(120) NOT NULL,
    descricao   TEXT,
    ativa       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tabelas_preco_nome_uk UNIQUE (nome)
);

CREATE TABLE categorias (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    categoria_pai_id BIGINT REFERENCES categorias (id) ON DELETE RESTRICT,
    nome            VARCHAR(120) NOT NULL,
    slug            VARCHAR(140) NOT NULL,
    descricao       TEXT,
    imagem_url      VARCHAR(500),
    ordem           INT NOT NULL DEFAULT 0,
    ativa           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT categorias_slug_uk UNIQUE (slug),
    CONSTRAINT categorias_sem_auto_loop_ck CHECK (categoria_pai_id IS NULL OR categoria_pai_id <> id)
);

CREATE INDEX categorias_pai_idx    ON categorias (categoria_pai_id);
CREATE INDEX categorias_ordem_idx  ON categorias (ordem) WHERE ativa;

CREATE TABLE produtos (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sku               VARCHAR(60)  NOT NULL,
    nome              VARCHAR(200) NOT NULL,
    slug              VARCHAR(220) NOT NULL,
    categoria_id      BIGINT NOT NULL REFERENCES categorias (id) ON DELETE RESTRICT,
    marca             VARCHAR(80),
    unidade_medida    VARCHAR(6),
    descricao_curta   VARCHAR(500),
    descricao_tecnica TEXT,
    ncm               VARCHAR(8),
    origem_mercadoria CHAR(1) NOT NULL DEFAULT '0',
    peso_kg           NUMERIC(10,3),
    altura_cm         NUMERIC(10,3),
    largura_cm        NUMERIC(10,3),
    comprimento_cm    NUMERIC(10,3),
    preco_custo       NUMERIC(14,2),
    preco_venda       NUMERIC(14,2) NOT NULL CHECK (preco_venda >= 0),
    estoque_minimo    NUMERIC(14,3),
    controla_estoque  BOOLEAN NOT NULL DEFAULT TRUE,
    ativo             BOOLEAN NOT NULL DEFAULT TRUE,
    destaque          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at        TIMESTAMPTZ,
    CONSTRAINT produtos_sku_uk  UNIQUE (sku),
    CONSTRAINT produtos_slug_uk UNIQUE (slug)
);

CREATE INDEX produtos_categoria_idx ON produtos (categoria_id);
CREATE INDEX produtos_vitrine_idx   ON produtos (ativo, destaque) WHERE deleted_at IS NULL;
CREATE INDEX produtos_nome_trgm_idx ON produtos (nome);

CREATE TABLE produto_imagens (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    produto_id   BIGINT NOT NULL REFERENCES produtos (id) ON DELETE CASCADE,
    url          VARCHAR(500) NOT NULL,
    alt_text     VARCHAR(200),
    ordem        INT NOT NULL DEFAULT 0,
    is_principal BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX produto_imagens_produto_idx ON produto_imagens (produto_id);

CREATE TABLE tabela_preco_itens (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tabela_preco_id BIGINT NOT NULL REFERENCES tabelas_preco (id) ON DELETE CASCADE,
    produto_id      BIGINT NOT NULL REFERENCES produtos (id)   ON DELETE CASCADE,
    preco           NUMERIC(14,2) NOT NULL CHECK (preco >= 0),
    CONSTRAINT tabela_preco_itens_uk UNIQUE (tabela_preco_id, produto_id)
);

CREATE INDEX tabela_preco_itens_produto_idx ON tabela_preco_itens (produto_id);
