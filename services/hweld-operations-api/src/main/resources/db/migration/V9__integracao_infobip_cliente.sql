-- V9 — Credenciais da integração gerenciadas pelo cliente no painel.
-- Segredos cifrados (AES-256-GCM) em colunas *_enc; `webhook_secret` é
-- gerado pelo servidor na 1ª gravação e compõe o path público do DLR.
-- `versao` sustenta o optimistic locking do formulário (409 em divergência).
ALTER TABLE integration_settings
    ADD COLUMN IF NOT EXISTS nome_conta VARCHAR(120),
    ADD COLUMN IF NOT EXISTS base_url VARCHAR(200),
    ADD COLUMN IF NOT EXISTS api_key_enc TEXT,
    ADD COLUMN IF NOT EXISTS webhook_secret_enc TEXT,
    ADD COLUMN IF NOT EXISTS envio_pausado BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS versao BIGINT NOT NULL DEFAULT 0;
