# HWeld — Backend

Backend da plataforma HWeld: e-commerce, CRM, catálogo, vendas, ordens de
serviço, estoque, fiscal e financeiro — construído em Rust com Actix Web,
SQLx e PostgreSQL, seguindo Clean Architecture / Hexagonal Architecture.

## Arquitetura

Cargo workspace com 5 crates. As dependências apontam sempre para dentro
(a regra de dependência da Clean Architecture):

```
hweld-server        composição: DI, bootstrap HTTP, migrations, seed
      │
hweld-api           Actix Web: handlers, DTOs, extractors, rotas, erros HTTP
      │
hweld-application   casos de uso + ports (traits de repositório/gateways)
      │
hweld-domain        entidades, value objects, máquinas de estado, regras puras
      ▲
hweld-infrastructure  implementa os ports: SQLx/Postgres, Argon2id, JWT, fiscal
```

- **domain** não depende de nada do workspace — regras de negócio puras e
  testáveis (`crates/domain/tests/regras.rs`).
- **application** define as interfaces (`ports/`); nunca importa SQLx/Actix.
- **infrastructure** implementa os ports; multi-tabela sempre em transação.
- **api** traduz HTTP ↔ aplicação; sem regra de negócio em handlers.
- **server** é o único lugar que conhece tudo (composition root em `main.rs`).

### Autenticação

Dois públicos, dois tokens:

| Público | Tabela | Endpoint | `sub` |
|---|---|---|---|
| Staff (interno) | `usuarios` | `POST /api/v1/auth/staff/login` | `staff:<id>` |
| Portal B2B | `contatos` | `POST /api/v1/auth/portal/login` | `portal:<id>` |

- Access token JWT (15 min padrão) + refresh token opaco (14 dias), este
  persistido como hash SHA-256 em `refresh_tokens` com rotação a cada uso —
  reuso de refresh revogado invalida a sessão.
- Senhas com Argon2id. RBAC staff por `Perfil`: `admin`, `vendedor`,
  `financeiro`, `estoque`, `tecnico`.

## Pré-requisitos

- Rust 1.85+ (edition 2021), `cargo`
- Docker (para o PostgreSQL local) **ou** um Postgres 15+ acessível
- `sqlx-cli` apenas se quiser rodar migrations manualmente
  (`cargo install sqlx-cli --features postgres`)

## Subindo em desenvolvimento

```bash
# 1. PostgreSQL + Elasticsearch
docker compose up -d

# 2. Configuração
cp .env.example .env          # ajuste JWT_SECRET e ADMIN_SENHA

# 3. Build + run — aplica migrations, semeia admin/formas de pagamento
#    e garante o índice do Elasticsearch (se ELASTICSEARCH_URL estiver setada)
cargo run -p hweld-server
```

Servidor em `http://localhost:8080`:

- `GET /api/v1/saude` — liveness
- `GET /api/v1/saude/prontidao` — readiness (faz `SELECT 1` no pool)

Admin inicial (dev): `admin@hweld.local` / valor de `ADMIN_SENHA`.

## Testes e verificação

```bash
cargo test --workspace                                   # unitários do domínio
cargo fmt --all -- --check                               # formatação
cargo clippy --workspace --all-targets -- -D warnings    # lint
python scripts/smoke_test.py                             # E2E (requer servidor no ar)
python scripts/busca_test.py                             # suite de busca (requer ES no ar)
```

O smoke test (`scripts/smoke_test.py`) cobre o fluxo completo: login staff,
RBAC, CRM, catálogo, estoque, portal B2B (login → catálogo → carrinho →
checkout → pedido), reserva de estoque, caixa, parcelas, baixa e auditoria.
É idempotente — pode ser re-executado.

O teste de busca (`scripts/busca_test.py`) semeia 9 produtos variados e
exercita **todas** as capacidades do Elasticsearch: full-text com relevância,
fuzzy (typos), asciifolding (acentos), filtros combinados, facetas com
contagens, autocomplete, paginação, visibilidade staff/portal, RBAC e a
sincronização best-effort do índice. Reexecutável — localiza recursos
existentes em vez de recriar.

## Estrutura de rotas (v1)

| Grupo | Rotas |
|---|---|
| `auth` | staff/login, portal/login, refresh, logout, senha |
| `usuarios` | CRUD staff (admin) |
| `empresas` `contatos` `enderecos` `oportunidades` `interacoes` | CRM |
| `categorias` `produtos` `tabelas-preco` | catálogo |
| `portal` | catálogo, carrinho, checkout (token portal) |
| `orcamentos` `pedidos` | vendas |
| `estoque` | movimentações, saldos, abaixo do mínimo |
| `ordens-servico` | OS + histórico |
| `notas-fiscais` | emissão/autorização (gateway stub) |
| `pagamentos` `formas-pagamento` `caixas` | financeiro |
| `auditoria` | consulta de `logs_auditoria` (append-only) |
| `busca` | full-text/facetas (staff) + `POST /busca/reindexar` (admin) |
| `portal/busca` | busca do catálogo + `sugestoes` autocomplete (token portal) |

## Busca (Elasticsearch)

Motor de busca opcional via cliente oficial `elasticsearch` (8.x). Sem
`ELASTICSEARCH_URL` a feature desliga com degradação limpa: endpoints de
busca respondem `503` e todo o resto funciona.

**Índice** `hweld_produtos` (criado no boot quando `ES_ENSURE_INDEX=true`):
analyzer `texto_pt` (asciifolding — "acucar"≈"açúcar"), subcampo
`nome.autocomplete` do tipo `search_as_you_type` e `preco` `scaled_float`.

**Full-text** — `multi_match` `best_fields` sobre `nome^3`, `sku^4`,
`descricao`, `marca^2`, `categoria_nome^2` com `fuzziness: "AUTO"` (tolera
1–2 erros de digitação) e `prefix_length: 1`. Hits ordenados por score,
desempatados por `destaque` e recência.

**Filtros e facetas** — `categoria_id`, `marca`, `preco_min`/`preco_max`
e `ativo` vão no contexto `filter` (cacheável, não pontua). Aggregations
`terms` (categoria, marca) + `stats` (preço) voltam em toda resposta com
contagens em tempo real — a UI pode renderizar filtros dinâmicos.

**Autocomplete** — `GET /portal/busca/sugestoes?q=` usa `bool_prefix`
sobre `search_as_you_type` (n-gramas 1/2/3 gerados na indexação);
`_source` traz só `nome`/`sku`.

**Consistência** — ES é índice secundário: o CRUD escreve no Postgres e
sincroniza o índice *best-effort* pós-commit (falha só loga). Hits são
hidratados do Postgres preservando a ordem de relevância — divergências
se reparam com `POST /busca/reindexar` (recria o índice e faz bulk do
catálogo inteiro).

**Kibana** — painel de administração do cluster em `http://localhost:5601`
(sobe junto no `docker compose up`, mesmo versionamento do ES). Útil para:

- *Dev Tools → Console*: rodar queries DSL direto
  (`GET hweld_produtos/_search`, `GET _cluster/health`);
- *Stack Management → Index Management*: inspecionar mappings/settings
  do `hweld_produtos`;
- *Discover* com data view `hweld_produtos`: navegar os docs indexados;
- dashboards de monitoramento do cluster e das queries de busca.

## Documentação da API (Swagger/OpenAPI)

A spec OpenAPI 3 é **gerada em compile-time** pelo `utoipa` a partir das
anotações `#[utoipa::path]` dos 94 handlers — o documento nunca diverge
do código (qualquer rota/schema errado vira erro de compilação).

| Recurso | URL |
|---|---|
| Swagger UI | `http://localhost:8080/swagger-ui/` |
| Spec JSON | `http://localhost:8080/api-docs/openapi.json` |

**Autenticando na UI** — clique em *Authorize* e cole `Bearer <access_token>`
(o esquema `bearer_auth` é JWT). Os dois contextos são distintos:

- **staff**: `POST /api/v1/auth/staff/login` → token cobre backoffice
  (`/usuarios`, `/produtos`, `/busca/produtos`, `/auditoria`...);
- **portal**: `POST /api/v1/auth/portal/login` → token cobre apenas
  `/portal/*` (catálogo, busca, carrinho, checkout).

A descrição de cada operação indica o contexto exigido. Operações
públicas (health, logins, refresh, logout) não exigem token.

**O que a spec cobre**: 69 paths / 94 operações em 14 tags, ~150 schemas
(request DTOs, entidades paginadas `Pagina_*`, envelopes de busca, enums
com os valores serializados reais — ex.: `StatusPedido` =
`aguardando_pagamento`...), `Id<T>` como `int64` e `Dinheiro`/`Quantidade`
como `string` decimal (sem perda de precisão).

**Produção** — a UI é servida pelo próprio backend (sem CDN). Se a spec
não deve ser pública, proteja `/swagger-ui` e `/api-docs` no proxy
reverso (o código em si já exige auth apenas nos endpoints da API).

## Configuração

Toda configuração vem de ambiente (`crates/infrastructure/src/config.rs`,
via `.env` com `dotenvy`). Não há valores de ambiente espalhados pelo código.
Ver `.env.example` para a lista completa e comentários.

## Produção — checklist

- [ ] `JWT_SECRET` com ≥32 bytes aleatórios (`openssl rand -base64 48`)
- [ ] `ADMIN_SENHA` forte, ou `SEED_ADMIN=false`
- [ ] `CORS_PERMISSIVE=false` + `CORS_ORIGINS` com allowlist explícita
- [ ] `ENVIRONMENT=production`
- [ ] TLS terminado no proxy reverso (nginx/caddy) na frente do Actix
- [ ] `DATABASE_URL` apontando para instância gerenciada com `sslmode=require`
- [ ] Substituir o stub `FiscalGateway` por integração real (SEFAZ/emissor)
- [ ] ES com `xpack.security` + HTTPS + `ELASTICSEARCH_USERNAME/PASSWORD`
- [ ] Sync de índice via outbox/CDC (hoje é best-effort pós-commit)

## Migrations

SQL puro em `migrations/NNNN_*.sql`, aplicadas pelo `sqlx::migrate!` no boot
quando `RUN_MIGRATIONS=true`. Schema: 24 tabelas de negócio +
`refresh_tokens` + sequences para numeração de documentos
(`pedidos` → `PV-000001`, `orcamentos` → `OR-000001`, OS, NF).

## Decisões relevantes

- **`Id<T>` tipado** — impede trocar `Id<Pedido>` por `Id<Empresa>` em compile time.
- **Máquinas de estado no domínio** — `transicionar()` valida cada mudança de
  status; handlers nunca fazem `if status == ...` de regra.
- **Estoque = projeção** — `estoque_saldos` é derivado de
  `estoque_movimentacoes` (append-only), atualizado na mesma transação.
- **Baixa de pagamento atômica** — `pagamentos` + `caixa_movimentacoes` na
  mesma transação; nunca existe pagamento pago sem lançamento no caixa.
- **`Dinheiro`/`Quantidade`** — `Decimal` com arredondamento fixo (2/3 casas),
  serializado como string JSON (`serde-str`) para não perder precisão.
- **Auditoria append-only** — `logs_auditoria` registra ator, entidade, ação
  e snapshot antes/depois; sem UPDATE/DELETE.
