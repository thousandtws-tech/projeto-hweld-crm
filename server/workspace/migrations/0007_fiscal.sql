-- 0007 — Fiscal: notas fiscais e itens. Tributos ficam nas colunas do item;
-- regras de cálculo (regime, UF, CST) vivem na camada de aplicação (modelo §4.16).

CREATE TABLE notas_fiscais (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero                VARCHAR(20) NOT NULL,
    serie                 VARCHAR(5),
    chave_acesso          CHAR(44),
    pedido_id             BIGINT NOT NULL REFERENCES pedidos (id)   ON DELETE RESTRICT,
    empresa_id            BIGINT NOT NULL REFERENCES empresas (id)  ON DELETE RESTRICT,
    tipo                  TEXT NOT NULL DEFAULT 'saida'
                          CHECK (tipo IN ('saida','devolucao','complementar')),
    status                TEXT NOT NULL
                          CHECK (status IN ('rascunho','autorizada','cancelada','rejeitada','denegada')),
    natureza_operacao     VARCHAR(120),
    cfop                  VARCHAR(6),
    emitida_em            TIMESTAMPTZ,
    valor_produtos        NUMERIC(14,2),
    valor_frete           NUMERIC(14,2),
    valor_desconto        NUMERIC(14,2),
    valor_total           NUMERIC(14,2),
    protocolo_autorizacao VARCHAR(40),
    xml_path              VARCHAR(500),
    pdf_path              VARCHAR(500),
    motivo_cancelamento   VARCHAR(300),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT nf_chave_uk UNIQUE (chave_acesso),
    CONSTRAINT nf_numero_serie_uk UNIQUE (numero, serie),
    CONSTRAINT nf_cancelamento_motivo_ck
        CHECK (status <> 'cancelada' OR motivo_cancelamento IS NOT NULL)
);

CREATE INDEX nf_pedido_idx  ON notas_fiscais (pedido_id);
CREATE INDEX nf_empresa_idx ON notas_fiscais (empresa_id);
CREATE INDEX nf_status_idx  ON notas_fiscais (status);

CREATE TABLE nota_fiscal_itens (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nf_id          BIGINT NOT NULL REFERENCES notas_fiscais (id) ON DELETE CASCADE,
    produto_id     BIGINT REFERENCES produtos (id)               ON DELETE SET NULL,
    codigo         VARCHAR(60),
    descricao      VARCHAR(300),
    ncm            VARCHAR(8),
    cfop           VARCHAR(6),
    unidade        VARCHAR(6),
    quantidade     NUMERIC(14,3),
    valor_unitario NUMERIC(14,2),
    valor_total    NUMERIC(14,2),
    icms_aliquota  NUMERIC(5,2),
    icms_valor     NUMERIC(14,2),
    ipi_aliquota   NUMERIC(5,2),
    ipi_valor      NUMERIC(14,2),
    pis_valor      NUMERIC(14,2),
    cofins_valor   NUMERIC(14,2)
);

CREATE INDEX nf_itens_nf_idx ON nota_fiscal_itens (nf_id);
