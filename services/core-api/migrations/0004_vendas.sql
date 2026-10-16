-- 0004 — Vendas: carrinhos, pedidos, parcelas. Fecha a FK circular orcamentos↔pedidos.

CREATE TABLE carrinhos (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    uuid       UUID NOT NULL DEFAULT gen_random_uuid(),
    contato_id BIGINT REFERENCES contatos (id)  ON DELETE SET NULL,
    empresa_id BIGINT REFERENCES empresas (id)  ON DELETE SET NULL,
    session_id VARCHAR(128),
    status     TEXT NOT NULL DEFAULT 'aberto'
               CHECK (status IN ('aberto','convertido','abandonado')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT carrinhos_uuid_uk UNIQUE (uuid),
    CONSTRAINT carrinhos_dono_ck
        CHECK (contato_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE INDEX carrinhos_contato_idx ON carrinhos (contato_id) WHERE status = 'aberto';
CREATE INDEX carrinhos_session_idx ON carrinhos (session_id)  WHERE status = 'aberto';

CREATE TABLE carrinho_itens (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    carrinho_id    BIGINT NOT NULL REFERENCES carrinhos (id) ON DELETE CASCADE,
    produto_id     BIGINT NOT NULL REFERENCES produtos (id)  ON DELETE RESTRICT,
    quantidade     NUMERIC(14,3) NOT NULL CHECK (quantidade > 0),
    preco_unitario NUMERIC(14,2) NOT NULL,     -- snapshot na adição
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT carrinho_itens_uk UNIQUE (carrinho_id, produto_id)
);

CREATE TABLE pedidos (
    id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero                  VARCHAR(20) NOT NULL,
    empresa_id              BIGINT NOT NULL REFERENCES empresas (id)   ON DELETE RESTRICT,
    contato_id              BIGINT NOT NULL REFERENCES contatos (id)   ON DELETE RESTRICT,
    endereco_faturamento_id BIGINT NOT NULL REFERENCES enderecos (id)  ON DELETE RESTRICT,
    endereco_entrega_id     BIGINT NOT NULL REFERENCES enderecos (id)  ON DELETE RESTRICT,
    origem                  TEXT NOT NULL CHECK (origem IN ('ecommerce','orcamento','manual')),
    orcamento_id            BIGINT REFERENCES orcamentos (id)          ON DELETE RESTRICT,
    carrinho_id             BIGINT REFERENCES carrinhos (id)           ON DELETE SET NULL,
    vendedor_id             BIGINT REFERENCES usuarios (id)            ON DELETE SET NULL,
    status                  TEXT NOT NULL
                            CHECK (status IN ('aguardando_pagamento','confirmado','em_separacao',
                                              'faturado','enviado','entregue','concluido','cancelado')),
    subtotal                NUMERIC(14,2) NOT NULL,
    desconto                NUMERIC(14,2) NOT NULL DEFAULT 0,
    frete                   NUMERIC(14,2) NOT NULL DEFAULT 0,
    total                   NUMERIC(14,2) NOT NULL,
    condicao_pagamento      VARCHAR(200),
    observacoes             TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pedidos_numero_uk     UNIQUE (numero),
    -- conversão única: um orçamento gera no máximo 1 pedido (modelo §7.1)
    CONSTRAINT pedidos_orcamento_uk  UNIQUE (orcamento_id),
    CONSTRAINT pedidos_carrinho_uk   UNIQUE (carrinho_id),
    CONSTRAINT pedidos_origem_ck CHECK (
        (origem = 'orcamento' AND orcamento_id IS NOT NULL)
        OR (origem = 'ecommerce' AND carrinho_id IS NOT NULL)
        OR (origem = 'manual')
    )
);

CREATE INDEX pedidos_empresa_idx ON pedidos (empresa_id);
CREATE INDEX pedidos_contato_idx ON pedidos (contato_id);
CREATE INDEX pedidos_status_idx  ON pedidos (status);
CREATE INDEX pedidos_created_idx ON pedidos (created_at DESC);

CREATE TABLE pedido_itens (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pedido_id      BIGINT NOT NULL REFERENCES pedidos (id) ON DELETE CASCADE,
    produto_id     BIGINT NOT NULL REFERENCES produtos (id) ON DELETE RESTRICT,
    descricao      VARCHAR(300) NOT NULL,     -- snapshot
    sku            VARCHAR(60)  NOT NULL,     -- snapshot
    quantidade     NUMERIC(14,3) NOT NULL CHECK (quantidade > 0),
    preco_unitario NUMERIC(14,2) NOT NULL,
    desconto       NUMERIC(14,2) NOT NULL DEFAULT 0,
    total          NUMERIC(14,2) NOT NULL
);

CREATE INDEX pedido_itens_pedido_idx ON pedido_itens (pedido_id);

-- Fecha a referência circular: orçamento convertido → pedido gerado.
ALTER TABLE orcamentos
    ADD CONSTRAINT orcamentos_convertido_pedido_fk
    FOREIGN KEY (convertido_pedido_id) REFERENCES pedidos (id) ON DELETE SET NULL;

ALTER TABLE orcamentos
    ADD CONSTRAINT orcamentos_convertido_uk UNIQUE (convertido_pedido_id);

CREATE TABLE pagamentos (
    id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pedido_id              BIGINT NOT NULL REFERENCES pedidos (id) ON DELETE RESTRICT,
    parcela_num            INT NOT NULL CHECK (parcela_num >= 1),
    valor                  NUMERIC(14,2) NOT NULL CHECK (valor > 0),
    vencimento             DATE NOT NULL,
    pago_em                TIMESTAMPTZ,
    status                 TEXT NOT NULL DEFAULT 'pendente'
                           CHECK (status IN ('pendente','pago','vencido','cancelado','estornado')),
    forma_pagamento_id     BIGINT REFERENCES formas_pagamento (id) ON DELETE SET NULL,
    caixa_movimentacao_id  BIGINT,   -- FK adicionada em 0008 após criar caixa_movimentacoes
    observacao             VARCHAR(300),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pagamentos_parcela_uk UNIQUE (pedido_id, parcela_num)
);

CREATE INDEX pagamentos_pedido_idx    ON pagamentos (pedido_id);
CREATE INDEX pagamentos_vencimento_idx ON pagamentos (vencimento) WHERE status IN ('pendente','vencido');
CREATE INDEX pagamentos_status_idx    ON pagamentos (status);
