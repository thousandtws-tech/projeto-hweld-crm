-- 0006 — Estoque: saldos (projeção) + movimentações (fonte da verdade, imutáveis).
-- Regra do modelo §7.4: saldo nunca é escrito direto — toda variação nasce de
-- uma estoque_movimentacoes dentro da mesma transação.

CREATE TABLE estoque_saldos (
    produto_id             BIGINT PRIMARY KEY REFERENCES produtos (id) ON DELETE RESTRICT,
    quantidade_disponivel  NUMERIC(14,3) NOT NULL DEFAULT 0,
    quantidade_reservada   NUMERIC(14,3) NOT NULL DEFAULT 0,
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT saldo_nao_negativo_ck CHECK (quantidade_disponivel >= 0 AND quantidade_reservada >= 0)
);

CREATE TABLE estoque_movimentacoes (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    produto_id        BIGINT NOT NULL REFERENCES produtos (id)        ON DELETE RESTRICT,
    tipo              TEXT NOT NULL
                      CHECK (tipo IN ('entrada','saida','reserva','liberacao_reserva','ajuste')),
    -- positiva em entrada/saida/reserva/liberacao; assinada em ajuste (correção ±)
    quantidade        NUMERIC(14,3) NOT NULL CHECK (quantidade <> 0),
    saldo_antes       NUMERIC(14,3) NOT NULL,
    saldo_depois      NUMERIC(14,3) NOT NULL,
    pedido_id         BIGINT REFERENCES pedidos (id)          ON DELETE SET NULL,
    ordem_servico_id  BIGINT REFERENCES ordens_servico (id)   ON DELETE SET NULL,
    usuario_id        BIGINT REFERENCES usuarios (id)         ON DELETE SET NULL,
    motivo            VARCHAR(300),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT estoque_mov_motivo_ck
        CHECK (tipo <> 'ajuste' OR motivo IS NOT NULL)
);

CREATE INDEX estoque_mov_produto_idx ON estoque_movimentacoes (produto_id, created_at DESC);
CREATE INDEX estoque_mov_pedido_idx  ON estoque_movimentacoes (pedido_id);
CREATE INDEX estoque_mov_os_idx      ON estoque_movimentacoes (ordem_servico_id);
