-- 0014 — public_id (UUID) nas demais entidades com página de detalhe.
-- Mesmo padrão de empresas (0013): id interno segue sequencial para FKs;
-- public_id é o identificador externo opaco usado em URLs.

ALTER TABLE produtos
    ADD COLUMN public_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX produtos_public_id_uk ON produtos (public_id);

ALTER TABLE tabelas_preco
    ADD COLUMN public_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX tabelas_preco_public_id_uk ON tabelas_preco (public_id);

ALTER TABLE orcamentos
    ADD COLUMN public_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX orcamentos_public_id_uk ON orcamentos (public_id);

ALTER TABLE pedidos
    ADD COLUMN public_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX pedidos_public_id_uk ON pedidos (public_id);

ALTER TABLE ordens_servico
    ADD COLUMN public_id UUID NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX ordens_servico_public_id_uk ON ordens_servico (public_id);
