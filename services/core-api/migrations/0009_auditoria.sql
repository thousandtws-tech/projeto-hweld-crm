-- 0009 — Auditoria: quem mexeu, em quê, quando, de onde (modelo §4.18).

CREATE TABLE logs_auditoria (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id   BIGINT REFERENCES usuarios (id) ON DELETE SET NULL,
    entidade     VARCHAR(60) NOT NULL,
    entidade_id  BIGINT NOT NULL,
    acao         TEXT NOT NULL CHECK (acao IN ('insert','update','delete')),
    dados_antes  JSONB,
    dados_depois JSONB,
    ip           VARCHAR(45),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX logs_entidade_idx  ON logs_auditoria (entidade, entidade_id, created_at DESC);
CREATE INDEX logs_usuario_idx   ON logs_auditoria (usuario_id, created_at DESC);
CREATE INDEX logs_created_idx   ON logs_auditoria (created_at DESC);
