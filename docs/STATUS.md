# Status do Projeto HWELD

Snapshot consolidado do que está implementado, do que falta e das
integrações. Atualizado em 2026-11-13.

## Componentes

| Componente | Stack | Estado |
|---|---|---|
| `services/hweld-core-api` | Rust, Actix-web, sqlx, PostgreSQL `hweld` | Implementado — em produção (Railway) |
| `services/hweld-operations-api` | Java 25, Spring Boot 4.1, Flyway, PG `hweld_ops` | Implementado — providers reais pendentes de credenciais |
| `services/hweld-realtime-engine` | Elixir/Phoenix 1.8, Bandit | Implementado — em produção (Railway) |
| `apps/web` | Angular | Implementado — em produção (CF Workers) |
| `apps/painel-admin` | React + Vite + TanStack | Implementado — em produção (CF Workers) |
| `infra/cloudflare` | Workers + Static Assets | Implementado |
| `infra/railway` | Postgres + 3 serviços + ES | Implementado |
| `infra/oci` | compose + Caddy (self-hosted SP) | Removido do tree (existiu em `c9cf2c2`, retirado em `ca2310a`) |

## Feito — core-api (Rust)

- Clean Architecture: 5 crates (`server → api → application → domain ← infrastructure`)
- Auth: JWT HS256 staff + portal, Argon2id, refresh token opaco com rotação,
  RBAC (`admin`, `vendedor`, `financeiro`, `estoque`, `tecnico`)
- CRM: empresas, contatos, endereços, oportunidades, interações
- Catálogo: categorias, produtos, tabelas de preço
- Portal B2B: catálogo, carrinho, checkout
- Vendas: orçamentos, pedidos (máquinas de estado no domínio)
- Estoque: movimentações append-only → `estoque_saldos` (projeção na mesma TX)
- Ordens de serviço + histórico
- Financeiro: parcelas (`pagamentos` = contas a receber), formas de pagamento,
  caixas PDV (baixa atômica pagamento+movimento)
- Fiscal: `notas_fiscais` (registro) + `GET /internal/pedidos/{id}/dados-fiscais`
  (composição autoritativa server-side para o Java)
- Notificações: inbox (sino)
- Auditoria: `logs_auditoria` append-only com snapshot antes/depois
- Busca: Elasticsearch 8 (`hweld_produtos`, analyzer pt-BR, autocomplete,
  facetas, reindex, degradação limpa sem `ELASTICSEARCH_URL`)
- Integração inbound: `POST /api/v1/internal/eventos-financeiros`
  (`X-Service-Token`, dedupe por `event_id`)
- OpenAPI compile-time (utoipa): 94 handlers / 69 paths, Swagger UI
- Hardening prod: rate limit por IP real, docs gated, PATCH não-destrutivo

## Feito — operations-api (Java)

- Payments: port `PaymentProvider`, `StubPaymentProvider`, webhooks HMAC +
  idempotência `(provider, external_event_id)`, cancel/refund/reconcile
- Billing: `billing_invoices` (faturas/recebíveis)
- Fiscal: `FocusNFeProvider` (API v2 real), `NFeMapper`, máquina de estados,
  reconciliação de docs não-terminais, webhooks Focus autenticados + dedupe,
  admin de gatilhos `/v2/hooks`, artefatos XML/DANFE → `ObjectStorage`
- Notificações: templates + `notification_deliveries`,
  `EmailProvider` (`log` | `smtp`)
- Outbox transacional + relay com backoff/DLQ → core-api e realtime-engine
- Inbound: `POST /internal/events` (`X-Service-Token`) + `processed_events`
- Auditoria própria (`audit_logs`)
- Testes: unitários + integração Testcontainers

## Feito — realtime-engine (Elixir)

- `POST /ingest` (Bearer, comparação em tempo constante) → PubSub →
  SSE `/events/staff`, `/events/portal` (scope empresa via Postgrex + cache ETS),
  WS `/socket` (Phoenix Channels)
- `/monitor` LiveView (login staff via core-api), `/dashboard` legado,
  `/infra` LiveDashboard
- Telemetria: contadores por tipo, ring buffer 150 eventos, conexões vivas
- 30 testes

## Feito — apps

- **apps/web (Angular)**: home com seções CMS (slider, categorias, marcas,
  banners, trust-bar, newsletter), catálogo/busca/PDP, carrinho, checkout,
  conta (pedidos, detalhe, segurança), institucional (FAQ, garantia, trocas,
  privacidade, atendimento), login
- **apps/painel-admin (React)**: dashboard (KPIs, ABC, receita), CRM
  (empresas, oportunidades kanban), catálogo (categorias, produtos,
  tabelas-preço, CMS banners/marcas), vendas (orçamentos, pedidos),
  financeiro (caixa, pagamentos), fiscal (notas, configuração), OS,
  admin (usuários, busca), auditoria

## Feito — infra, CI e testes

- Cloudflare Workers `hweld-loja` + `hweld-admin`: static assets + proxy
  same-origin (`/api`→core, `/api/v1/{payments,billing,fiscal-documents,
  notifications,webhooks}`→ops, `/events`+`/socket`→realtime),
  `_headers` com cache imutável para bundles hashed
- Railway: Postgres + core-api + operations-api + realtime-engine +
  Elasticsearch (privado, wrapper docker p/ volume)
- Workflows: `ci.yml`, `deploy.yml`, `e2e-producao.yml` (+ job semanal de
  performance)
- `tests/e2e`: ~85 testes API + UI contra produção
- `tests/integration`: contrato, JWT/sessão, fronteiras, webhook borda,
  storage/busca, rate-limit
- `tests/performance`: 7 cenários (baseline, catálogo, busca, jornada mista,
  cache portal, ruptura)
- Auditorias: `docs/performance/*` (baseline, backend, frontend, relatório)

## Pendente — integrações (gaps de produção)

1. **PSP real (PIX/cartão)** — só `StubPaymentProvider`. Falta adapter real
   (Mercado Pago / Asaas / Pagar.me) + credenciais + homologação. Bloqueia
   pagamento real em produção.
2. **E-mail transacional** — `EMAIL_PROVIDER=log`. Falta SMTP real
   (`EMAIL_PROVIDER=smtp` + `SMTP_*`) ou serviço gerenciado.
3. **Fiscal em produção** — Focus NFe implementado, falta tokens
   `FOCUS_NFE_*`, `FOCUS_NFE_PRODUCTION_ENABLED=true`, dados do emitente e
   defaults tributários (natureza/CFOP/ICMS/PIS/COFINS). NFS-e municipal =
   iteração futura.
4. **MinIO/S3 em produção** — `MINIO_*` para artefatos fiscais (XML/DANFE);
   hoje noop em dev.

## Pendente — backend/domínio

- `OrderCreated` Rust→Java não emitido (canal `/internal/events` existe)
- Endpoints agregados de dashboard (`/dashboard/receita`, curva ABC) — hoje
  calculados no cliente
- Sync Elasticsearch via outbox/CDC (hoje best-effort pós-commit)
- Replay de eventos SSE (`Last-Event-ID` + ring buffer) — hoje sem
  durabilidade, by design; reavaliar se algum consumidor exigir completude
- `GatewayFiscal` stub no Rust — mantido por design (Java orquestra);
  remover só se dead code incomodar

## Pendente — frontend

- Painel: 10 páginas de listagem com fetch manual `por_pagina:100` +
  paginação client-side → migrar para `ListaPage`+`useQuery` (ver
  `docs/performance/REMAINING_BOTTLENECKS.md`)
- Angular bundle ~721 kB — tema custom Material (somente componentes usados)
- React entry chunk ~383 kB — avaliar `manualChunks` (recharts, kanban)
- SSR/prerender do catálogo público (SEO/LCP) — decisão de infra
- Fonts Google auto-hospedadas (subset)
- Kanban: paginação por estágio se volume crescer
- Web Vitals/RUM beacon — sem telemetria de campo

## Pendente — infra/ops (runbook `docs/runbooks/producao.md`)

- ~~WAF: bloquear `*.up.railway.app`~~ ✅ **edge guard implementada** — Worker
  injeta `x-edge-token`; Rust (`edge_guard.rs`), Java (`EdgeTokenFilter`) e
  Phoenix (`EdgeGuard`) rejeitam 403 tráfego direto. Falta: `wrangler secret
  put EDGE_TOKEN` ×2 workers + `EDGE_TOKEN` nos 3 serviços Railway +
  `E2E_EDGE_TOKEN` no GitHub (runbook `infra/cloudflare/README.md`)
- ~~Postgres: backup~~ ✅ `backup-postgres.yml` (pg_dump diário→MinIO,
  retenção 30d) + `docs/runbooks/backup-restore.md` (restore + avaliação HA).
  Falta: bucket `hweld-backups` + secrets `BACKUP_*` no GitHub
- Secrets GitHub: inventário em `docs/runbooks/secrets.md` — falta
  **criar os valores** em Settings→Secrets: `E2E_ADMIN_*`,
  `E2E_WEBHOOK_SECRET`, `E2E_MOTOR_INGEST_TOKEN`, `E2E_EDGE_TOKEN`,
  `RAILWAY_TOKEN`, `CLOUDFLARE_API_TOKEN`, `BACKUP_*`
- `deliv.json` com PII permanece no histórico git — procedimento pronto em
  `docs/runbooks/limpeza-pii-git.md` (filter-repo; **destrutivo, exige
  confirmação** + re-clone do time)
- Domínio próprio nos workers — passos documentados em
  `infra/cloudflare/README.md` (zona DNS→CF, `routes`, CORS/webhooks)
- ~~`API_DOCS_ENABLED=false` no operations-api~~ ✅ default agora é
  fail-safe OFF (`${API_DOCS_ENABLED:false}`); dev liga via compose/.env

## Integrações — mapa

| Integração | Status | Detalhe |
|---|---|---|
| PostgreSQL | ✅ prod | Railway plugin; `hweld` (Rust) + `hweld_ops` (Java) no mesmo server |
| Elasticsearch 8 | ✅ prod | `hweld_produtos`, privado (`elasticsearch.railway.internal`) |
| Realtime engine | ✅ prod | Rust `/ingest` → PubSub → SSE/WS |
| Rust ↔ Java | ✅ | JWT repassado p/ posse; `X-Service-Token`; outbox→relay→`eventos-financeiros` |
| Focus NFe v2 | 🟡 código pronto | falta credenciais/habilitação de produção |
| MinIO | 🟡 código pronto | noop em dev; provisionar em prod |
| SMTP | 🟡 provider `log` | configurável, não provisionado |
| PSP (PIX/cartão) | ❌ stub | adapter real pendente |
| SEFAZ (GatewayFiscal Rust) | ❌ stub | substituído pela orquestração Java — não é o caminho de prod |
| ClickUp (gestão) | ✅ | Space `TERCEIROS > HWELD` — backlog deste projeto |
