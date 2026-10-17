-- 0013 — public_id (UUID) em empresas: identificador externo não-sequencial.
-- O `id` BIGINT continua como PK/FK interna; `public_id` é o que aparece em
-- URLs e referências externas, impedindo enumeração (/empresas/3, /4, ...).

ALTER TABLE empresas
    ADD COLUMN public_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX empresas_public_id_uk ON empresas (public_id);
