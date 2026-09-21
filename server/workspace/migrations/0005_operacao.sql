-- 0005 — Operação: ordens de serviço, materiais consumidos, trilha de status.

CREATE TABLE ordens_servico (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero         VARCHAR(20) NOT NULL,
    pedido_id      BIGINT REFERENCES pedidos (id)     ON DELETE SET NULL,
    empresa_id     BIGINT NOT NULL REFERENCES empresas (id)  ON DELETE RESTRICT,
    contato_id     BIGINT REFERENCES contatos (id)    ON DELETE SET NULL,
    responsavel_id BIGINT REFERENCES usuarios (id)    ON DELETE SET NULL,
    descricao      TEXT,
    status         TEXT NOT NULL
                   CHECK (status IN ('aberta','em_andamento','aguardando_material','concluida','cancelada')),
    prioridade     TEXT NOT NULL DEFAULT 'normal'
                   CHECK (prioridade IN ('baixa','normal','alta','urgente')),
    aberta_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
    prevista_em    DATE,
    concluida_em   TIMESTAMPTZ,
    valor_mao_obra NUMERIC(14,2),
    valor_total    NUMERIC(14,2),
    observacoes    TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT os_numero_uk UNIQUE (numero)
);

CREATE INDEX os_empresa_idx     ON ordens_servico (empresa_id);
CREATE INDEX os_pedido_idx      ON ordens_servico (pedido_id);
CREATE INDEX os_status_idx      ON ordens_servico (status);
CREATE INDEX os_responsavel_idx ON ordens_servico (responsavel_id);

CREATE TABLE os_itens (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    os_id          BIGINT NOT NULL REFERENCES ordens_servico (id) ON DELETE CASCADE,
    produto_id     BIGINT NOT NULL REFERENCES produtos (id)       ON DELETE RESTRICT,
    quantidade     NUMERIC(14,3) NOT NULL CHECK (quantidade > 0),
    preco_unitario NUMERIC(14,2) NOT NULL,      -- custo/venda no consumo
    total          NUMERIC(14,2) NOT NULL
);

CREATE INDEX os_itens_os_idx ON os_itens (os_id);

-- Trilha de auditoria das transições de status — imutável (modelo §7.2).
CREATE TABLE os_historicos (
    id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    os_id          BIGINT NOT NULL REFERENCES ordens_servico (id) ON DELETE CASCADE,
    status_anterior TEXT,
    status_novo    TEXT NOT NULL,
    usuario_id     BIGINT REFERENCES usuarios (id) ON DELETE SET NULL,
    observacao     VARCHAR(300),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX os_historicos_os_idx ON os_historicos (os_id, created_at);
