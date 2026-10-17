-- ── refresh_tokens: identidade de sessão (device/IP) estilo "suas sessões" ──
-- sessao_id: UUID estável que sobrevive à rotação de refresh tokens.
-- ip/user_agent: contexto capturado no login/refresh para exibição ao usuário.
-- ultimo_acesso_em: atualizado a cada rotação (aproxima "última atividade").
ALTER TABLE refresh_tokens
    ADD COLUMN sessao_id        UUID NOT NULL DEFAULT gen_random_uuid(),
    ADD COLUMN ip               TEXT,
    ADD COLUMN user_agent       TEXT,
    ADD COLUMN ultimo_acesso_em TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX refresh_tokens_sessao_idx ON refresh_tokens (sessao_id);
