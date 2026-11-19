# Inventário de Secrets — HWeld

Fonte única da verdade: **este arquivo**. O que cada segredo faz, onde vive
e como rotacionar. Regra de ouro: segredo real NUNCA entra no repo — os
`.env.example` e `infra/railway/env/*.env.example` só guardam a receita.

Geração padrão: `openssl rand -hex 32` (256 bits) ou `mix phx.gen.secret`
para `SECRET_KEY_BASE`.

## 1. Segredos compartilhados entre serviços

| Segredo | Consumidores | Para que serve |
|---|---|---|
| `JWT_SECRET` | core-api, operations-api, realtime-engine | Assina/valida JWT HS256 (`sub`, `tipo`, `perfil`). ≥32 bytes, fail-fast sem ele. |
| `INTERNAL_SERVICE_TOKEN` | core-api, operations-api | Auth service-to-service `X-Service-Token` em `/api/v1/internal/**`. |
| `MOTOR_INGEST_TOKEN` | core-api (envia), realtime-engine (valida) | Auth do `POST /ingest` e do painel `/dashboard`/`/monitor`. |
| `EDGE_TOKEN` | Worker Cloudflare (injeta), 3 serviços (validam) | Guarda de borda — origem rejeita tráfego direto `*.up.railway.app`. |

> **Rotação**: segredo compartilhado exige janela curta de dupla validação
> ou deploy coordenado (edge + 3 origens). Planejar fora de horário de pico.

## 2. GitHub Actions (Settings → Secrets and variables → Actions)

| Secret | Usado em | Para que |
|---|---|---|
| `RAILWAY_TOKEN` | `deploy.yml` | Project token do Railway p/ `railway up --ci`. |
| `CLOUDFLARE_API_TOKEN` | `deploy.yml` | `wrangler deploy` dos workers loja/admin. |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_SENHA` | `e2e-producao.yml` | Credenciais do admin de produção (login E2E). |
| `E2E_WEBHOOK_SECRET` | `e2e-producao.yml` | Assina webhooks stub nos testes de contrato. |
| `E2E_MOTOR_INGEST_TOKEN` | `e2e-producao.yml` | POST /ingest direto no realtime de produção. |
| `E2E_EDGE_TOKEN` | `e2e-producao.yml` | Mesmo `EDGE_TOKEN` — specs batem nas origens sem passar pelo Worker. |
| `BACKUP_DATABASE_URL` | `backup-postgres.yml` | Connection string Postgres de produção (somente leitura recomendada). |
| `BACKUP_S3_*` (4 vars) | `backup-postgres.yml` | Credenciais do bucket de backups (ver §5). |

## 3. Railway — por serviço

Referência linha a linha: `infra/railway/env/*.env.example`.

- **core-api**: `DATABASE_URL`, `JWT_SECRET`, `ENVIRONMENT=production`,
  `SEED_ADMIN`, `ADMIN_*`, `CORS_ORIGINS`, `MOTOR_URL`/`MOTOR_INGEST_TOKEN`,
  `MINIO_*`, `ELASTICSEARCH_*`, `EDGE_TOKEN`.
- **operations-api**: `DB_*`, `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN`,
  `CORE_API_URL` (private `*.railway.internal`), `MOTOR_*`, `MINIO_*`,
  `PAYMENT_*`, `FISCAL_*`/`FISCAL_NFE_*`, `SMTP_*`/`MAIL_*`, `EDGE_TOKEN`.
  `API_DOCS_ENABLED` fica `false` — default fail-safe.
- **realtime-engine**: `PHX_SERVER`, `SECRET_KEY_BASE`, `JWT_SECRET`,
  `MOTOR_INGEST_TOKEN`, `DATABASE_URL`, `RUST_API_URL` (private),
  `PHX_HOST`, `CORS_ORIGINS`, `EDGE_TOKEN`.
- **Postgres/MinIO/Elasticsearch**: credenciais próprias do addon Railway —
  injetadas via `${{Postgres.*}}` nas vars dos serviços.

## 4. Cloudflare Workers

| Segredo | Onde | Para que |
|---|---|---|
| `EDGE_TOKEN` | `wrangler secret put EDGE_TOKEN` nos workers `hweld-loja` e `hweld-admin` | Injetado como `x-edge-token` em todo proxy à origem. **Nunca em `vars`** (vai pro repo). |

`wrangler.jsonc`/`wrangler.admin.jsonc`: só `vars` públicas (origens).

## 5. Backups

| Secret | Onde | Para que |
|---|---|---|
| `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` | Railway (serviço MinIO) | Credenciais S3 — os backups do `backup-postgres.yml` sobem no bucket `hweld-backups`. |

Ver `docs/runbooks/backup-restore.md`.

## 6. Integrações externas (quando ativadas)

| Segredo | Onde | Status |
|---|---|---|
| Spedy `X-Api-Key` / `whsec_*` | painel → `integration_settings` (cifrado) | Credenciais do cliente — nunca em env; webhook auto-registrado ao salvar. |
| `PAYMENT_*_WEBHOOK_SECRET` | operations-api | Por PSP (Mercado Pago, Asaas…). |
| `SMTP_*` | operations-api | Provider real de e-mail transacional. |
| `NEW_RELIC_LICENSE_KEY` | core-api | Telemetria OTLP (opcional). |

## 7. Checklist de higiene

- [ ] Nenhum segredo real em `.env.example`, `wrangler.jsonc`, workflows.
- [ ] `deliv.json` fora do repo (ver `docs/runbooks/limpeza-pii-git.md`).
- [ ] Rotação anotada no audit log quando feita (compliance).
- [ ] E2E secrets existem no GitHub antes de habilitar EDGE_TOKEN em prod.
