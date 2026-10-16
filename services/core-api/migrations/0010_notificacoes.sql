-- ── notificacoes — inbox persistente do sino (staff + portal) ────────────────
-- Fan-out na escrita: uma linha por destinatário (read state é individual).
-- `destino_tipo` separa os dois contextos de autenticação; exatamente um dos
-- FKs é preenchido (CHECK abaixo). `link` é rota do frontend, não URL absoluta.

CREATE TABLE notificacoes (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    destino_tipo  TEXT NOT NULL CHECK (destino_tipo IN ('staff', 'portal')),
    usuario_id    BIGINT REFERENCES usuarios (id) ON DELETE CASCADE,
    contato_id    BIGINT REFERENCES contatos (id) ON DELETE CASCADE,
    tipo          VARCHAR(60) NOT NULL,          -- ex.: 'pedido.criado'
    titulo        VARCHAR(160) NOT NULL,
    mensagem      VARCHAR(400) NOT NULL,
    link          VARCHAR(240),                  -- ex.: '/vendas/pedidos/3'
    lida_em       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT notificacoes_destino_ck CHECK (
        (destino_tipo = 'staff'  AND usuario_id IS NOT NULL AND contato_id IS NULL) OR
        (destino_tipo = 'portal' AND contato_id IS NOT NULL AND usuario_id IS NULL)
    )
);

-- Badge/dropdown: não lidas primeiro, mais recentes no topo.
CREATE INDEX notificacoes_usuario_idx ON notificacoes (usuario_id, lida_em, created_at DESC)
    WHERE usuario_id IS NOT NULL;
CREATE INDEX notificacoes_contato_idx ON notificacoes (contato_id, lida_em, created_at DESC)
    WHERE contato_id IS NOT NULL;
