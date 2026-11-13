-- Índices de performance identificados na auditoria de latência.
--
-- 1) `pg_trgm` + GIN para os filtros `ILIKE '%termo%'` de busca:
--    `produtos_nome_trgm_idx` (0002) era um btree comum com nome enganoso —
--    wildcard à esquerda nunca usava índice (seq scan em toda busca).
-- 2) Colunas filtradas sem índice: pedidos.origem, orcamentos.vendedor_id,
--    interacoes.contato_id.
--
-- Tudo CONCURRENTLY? Não — sqlx::migrate! roda dentro de transação e
-- CONCURRENTLY não pode entrar em tx. Em produção as tabelas quentes são
-- pequenas/médias hoje; os builds de índice são rápidos. Se produtos crescer
-- >1M linhas, reavaliar com manutenção agendada.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Busca textual de produtos (portal + staff): nome/sku/descricao_curta ILIKE.
DROP INDEX IF EXISTS produtos_nome_trgm_idx;
CREATE INDEX produtos_nome_trgm_idx    ON produtos USING gin (nome gin_trgm_ops);
CREATE INDEX produtos_sku_trgm_idx     ON produtos USING gin (sku gin_trgm_ops);
CREATE INDEX produtos_desc_trgm_idx    ON produtos USING gin (descricao_curta gin_trgm_ops);

-- Cobertura de filtros sem índice (audit M5).
CREATE INDEX pedidos_origem_idx        ON pedidos (origem);
CREATE INDEX orcamentos_vendedor_idx   ON orcamentos (vendedor_id);
CREATE INDEX interacoes_contato_idx    ON interacoes (contato_id);

-- Sort da vitrine: ORDER BY destaque DESC, (tem imagem) DESC, nome — índice
-- mais largo substitui o parcial de 0002 (mesmo filtro, cobre também nome).
DROP INDEX IF EXISTS produtos_vitrine_idx;
CREATE INDEX produtos_vitrine_idx ON produtos (ativo, destaque, nome)
    WHERE deleted_at IS NULL;
