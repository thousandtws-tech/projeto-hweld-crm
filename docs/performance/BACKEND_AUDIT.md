# Auditoria de Performance — Backends

**Data**: 2025-01 (continuação da missão frontend) · **Escopo**: `hweld-core-api` (Rust/Actix), `hweld-operations-api` (Spring Boot 4), `hweld-realtime-engine` (Phoenix) — produção Railway + Cloudflare Workers.

## Metodologia

Auditoria estática linha-a-linha (repositories, middleware, migrations, bootstrap) + medição de produção (`tests/performance/00-baseline` com VUs reais) + headers HTTP reais.

## Baseline medido (pré-mudança, produção)

| Endpoint | Volume | p50 | p95 | p99 | Erros |
|---|---|---|---|---|---|
| core-api `/health` (20 VUs × 15s) | 1491 req @ 99 rps | 200ms | 211ms | 274ms | 0 |
| realtime `/health` (15 VUs × 10s) | 598 req @ 60 rps | 203ms | 453ms | 572ms | 0 |
| `/portal/categorias` direto (quente) | — | ~230-250ms | — | — | 0 |
| `/portal/categorias` via Worker | — | ~300-900ms | — | — | 0 |

O piso de ~200ms é **RTT de rede** até o Railway (ams) — não é tempo de handler. Os ganhos abaixo atacam o tempo de servidor, o tamanho de resposta e a necessidade de ir ao servidor.

## O que já estava correto (não mexer)

- Auth JWT **stateless** — zero DB por request (assinatura local).
- `Compress` (gzip) ativo: catálogo 12.8kB → 1.3kB (~90%).
- `CacheListas` in-process com **geração global** de invalidação + TTL 5s.
- `tokio::join!` COUNT‖página em produtos/vendas; batch `ANY($1)` em imagens — sem N+1 no catálogo.
- Índices parciais bem desenhados (pedidos, pagamentos, notificações, carrinhos).
- Realtime publish fire-and-forget com timeout 500ms.
- Argon2 em `spawn_blocking`; LTO thin + codegen-units=1 no release.
- ES: `_source:false`, `request_cache`, bulk com `refresh_interval` toggle.

## Implementado (commit `af8e4cd`, branch `develop`)

### core-api — Rust/Actix

| Mudança | Arquivo | Ganho |
|---|---|---|
| Middleware `CacheHttp`: ETag fraco + `If-None-Match`→304 + `Cache-Control` (portal anônimo `public, max-age=15, stale-while-revalidate=45`; demais GETs `private, no-cache`) + `Vary: Authorization` | `crates/api/src/cache_http.rs` | Revalidação ~0 bytes; hits públicos sem RTT por 15s |
| Cache `tabela_da_empresa` por empresa | `persistence/catalogo.rs` | −2 queries/request em catálogo/PDP/busca/carrinho |
| Cache `buscar_por_id` (empresas, contatos) | `persistence/crm.rs` | −1 query por request autenticado do portal |
| Cache `listar_todas` (categorias) | `persistence/catalogo.rs` | −1 query por navegação/busca com facetas |
| Cache CMS da loja (30s + invalidação no PUT) | `handlers/catalogo.rs` | −1 GET remoto ao object storage por hit |
| Pool PG: `min_connections=2`, `acquire_timeout=5s`, `idle=600s`, `max_lifetime=1800s`, `statement_timeout=10s`, `idle_in_transaction=30s` | `persistence/mod.rs` | Sem hang de pool; conexões quentes pós-idle |
| ES: `timeout 1.5s` no transporte; `Refresh::WaitFor`→`False` em index/remove single-doc | `busca/elasticsearch.rs` | −0,5–1s por escrita de produto; sem hang unbounded |
| Auditoria `registrar` fire-and-forget (`tokio::spawn`) | `persistence/auditoria.rs` | −1 INSERT awaited por mutação |
| `notificacoes.listar` COUNT‖página | `persistence/notificacoes.rs` | ~2× menos latência na listagem |
| Lookup de preço O(1) (`HashMap`) em catálogo e busca | `use_cases/catalogo.rs`, `busca.rs` | page×tabela → page |
| HttpServer `keep_alive=75s` + `client_request_timeout=15s` | `server/main.rs` | Reuse de conexão edge→origem |
| Migration `0017`: `pg_trgm` + GIN em `produtos(nome,sku,descricao_curta)`; índices `pedidos.origem`, `orcamentos.vendedor_id`, `interacoes.contato_id`; vitrine `(ativo,destaque,nome)` | `migrations/0017_performance.sql` | ILIKE `%x%` sai de seq scan para index |

### operations-api — Spring Boot 4 / Java 25

- `server.compression.enabled` (JSON ≥1KB).
- `ShallowEtagHeaderFilter` em `/api/*` (ETag + 304).
- `CacheControlHeaderFilter`: `private, no-cache` + `Vary: Authorization` em GETs.
- `spring.threads.virtual.enabled=true` — virtual threads para IO-bound (JDBC/core-api/motor).

### Regressão

- `crates/api/tests/cache_http.rs` — 4 specs (ETag emitido, 304 sem corpo, política privada autenticada, handler com policy própria intocado).
- `tests/performance/04-portal-cache.spec.ts` — budgets p95 (direto <700ms, worker <900ms) + asserts de ETag/304/gzip em produção.

## Status de validação

- `cargo check/test/fmt --check` — verde. Clippy: 1 warning pré-existente (construtor DI de 8 args — convenção do codebase).
- `mvn test` — 52/52.
- **Deploy**: pendente — Railway retornou "Deploys have been paused temporarily" (restrição de conta/plano). Código commitado em `develop` (`af8e4cd`). Ao liberar: `railway up -s core-api` em `services/hweld-core-api`, idem `operations-api`; smoke + `npx playwright test 04-portal-cache.spec.ts` com `E2E_CORE_API`/`E2E_WEB_URL` de produção.

## Pendências mapeadas (próxima iteração)

- `INSERT … SELECT`/`UNNEST` no fan-out de notificações e itens do pedido (checkout com N itens faz N statements — p95 de escrita).
- `ProdutoResumoPortal` sem `descricao_tecnica`/dimensões nas listagens (−50-80% payload — muda contrato da listagem).
- Keyset pagination no lugar de `OFFSET` em páginas profundas.
- Geração de cache **por entidade** (hoje qualquer escrita invalida todas as listas).
- `EXPLAIN (ANALYZE, BUFFERS)` nos SQLs quentes assim que o deploy liberar; `pg_stat_statements` em produção.
- Endpoint agregado de dashboard (hoje o front compõe ~9 requests).
- Cold start Railway: conexões quentes (`min_connections=2`) mitigam parcialmente; réplica mínima depende do plano.
