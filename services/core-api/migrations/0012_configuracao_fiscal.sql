-- 0012 — Configuração fiscal SEFAZ (linha única, id = 1).
-- Guarda credenciais da integração: ambiente, série, CSC e certificado A1.
-- `certificado_pfx` é BYTEA — o binário nunca sai do banco; a API expõe
-- apenas metadados mascarados (nome, validade, fingerprint SHA-256).
-- `csc_token` e `certificado_senha` jamais são serializados em respostas.

CREATE TABLE configuracao_fiscal (
    id                    SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    ambiente              VARCHAR(12) NOT NULL DEFAULT 'homologacao'
                          CHECK (ambiente IN ('homologacao', 'producao')),
    serie_nf              VARCHAR(3),
    regime_tributario     VARCHAR(2) CHECK (regime_tributario IN ('1', '2', '3')),
    csc_id                VARCHAR(20),
    csc_token             TEXT,
    certificado_pfx       BYTEA,
    certificado_nome      VARCHAR(160),
    certificado_senha     TEXT,
    certificado_validade  DATE,
    certificado_sha256    CHAR(64),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO configuracao_fiscal (id) VALUES (1);
