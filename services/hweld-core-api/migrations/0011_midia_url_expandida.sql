-- 0011 — Expansão das colunas de mídia (categorias e imagens de produto)
-- Permite URLs longas de CDN, caminhos locais `/api/v1/midia/...` ou Data URLs otimizadas.

ALTER TABLE categorias
    ALTER COLUMN imagem_url TYPE TEXT;

ALTER TABLE produto_imagens
    ALTER COLUMN url TYPE TEXT;
