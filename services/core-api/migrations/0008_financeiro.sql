-- 0008 — Financeiro: sessões de caixa e lançamentos imutáveis.
-- Fecha a referência circular pagamentos↔caixa_movimentacoes.

CREATE TABLE caixas (
    id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    aberto_por                  BIGINT NOT NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
    aberto_em                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    valor_abertura              NUMERIC(14,2) NOT NULL DEFAULT 0,
    fechado_por                 BIGINT REFERENCES usuarios (id) ON DELETE SET NULL,
    fechado_em                  TIMESTAMPTZ,
    valor_fechamento_calculado  NUMERIC(14,2),
    valor_fechamento_informado  NUMERIC(14,2),
    diferenca                   NUMERIC(14,2),
    status                      TEXT NOT NULL DEFAULT 'aberto'
                                CHECK (status IN ('aberto','fechado'))
);

-- um único caixa aberto por vez (regra operacional de PDV/backoffice)
CREATE UNIQUE INDEX caixas_um_aberto_idx ON caixas (status) WHERE status = 'aberto';
CREATE INDEX caixas_aberto_em_idx ON caixas (aberto_em DESC);

CREATE TABLE caixa_movimentacoes (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    caixa_id            BIGINT NOT NULL REFERENCES caixas (id) ON DELETE RESTRICT,
    tipo                TEXT NOT NULL
                        CHECK (tipo IN ('suprimento','sangria','venda','recebimento','despesa','estorno')),
    valor               NUMERIC(14,2) NOT NULL CHECK (valor > 0),
    forma_pagamento_id  BIGINT REFERENCES formas_pagamento (id) ON DELETE SET NULL,
    pagamento_id        BIGINT REFERENCES pagamentos (id)       ON DELETE SET NULL,
    usuario_id          BIGINT REFERENCES usuarios (id)         ON DELETE SET NULL,
    descricao           VARCHAR(300),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX caixa_mov_caixa_idx     ON caixa_movimentacoes (caixa_id, created_at);
CREATE INDEX caixa_mov_pagamento_idx ON caixa_movimentacoes (pagamento_id);

-- baixa da parcela entra no caixa (modelo §5: pagamento → caixa_movimentacao 1:0..1)
ALTER TABLE pagamentos
    ADD CONSTRAINT pagamentos_caixa_mov_fk
    FOREIGN KEY (caixa_movimentacao_id) REFERENCES caixa_movimentacoes (id) ON DELETE SET NULL;

ALTER TABLE pagamentos
    ADD CONSTRAINT pagamentos_caixa_mov_uk UNIQUE (caixa_movimentacao_id);
