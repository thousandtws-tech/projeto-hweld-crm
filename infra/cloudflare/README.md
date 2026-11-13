# Infra — Cloudflare

Deploy dos frontends como **Cloudflare Workers com Static Assets**. Dois
workers, mesma lógica de proxy (`src/worker.ts`):

| App | Config | Worker | URL |
|---|---|---|---|
| Loja B2B (`apps/web`, Angular) | `wrangler.jsonc` | `hweld-loja` | `hweld-loja.<conta>.workers.dev` |
| Painel admin (`apps/painel-admin`, Vite/React) | `wrangler.admin.jsonc` | `hweld-admin` | `hweld-admin.<conta>.workers.dev` |

```
Browser → Worker
            ├── /api/v1/{payments,billing,fiscal-documents,
            │    notifications,events,webhooks}*
            │             → OPS_API_ORIGIN     (operations-api, Java/Spring — REST)
            ├── /api/*    → CORE_API_ORIGIN    (core-api, Rust/Actix — REST)
            ├── /events/* → REALTIME_ORIGIN    (realtime-engine, Phoenix — SSE)
            ├── /socket/* → REALTIME_ORIGIN    (Phoenix Channels — WebSocket)
            └── *         → static assets (SPA fallback → index.html)
```

O frontend é same-origin por design (`environment.prod.ts`: `apiUrl='/api/v1'`,
`realtimeUrl=''`). O Worker em `src/worker.ts` é o proxy de deploy que encaminha
`/events` e `/socket` ao motor — SSE e WebSocket passam por `fetch()` sem
buffering.

## Pré-requisitos

```bash
cd infra/cloudflare
npm install
npx wrangler login   # OAuth no browser — ou exportar CLOUDFLARE_API_TOKEN
```

## Origens dos backends

Preencher em `wrangler.jsonc` e `wrangler.admin.jsonc`, por ambiente
(`env.staging`, `env.production`):

| Var | Serviço | Exemplo |
|---|---|---|
| `CORE_API_ORIGIN` | `services/core-api` | `https://core-api-production.up.railway.app` |
| `REALTIME_ORIGIN` | `services/realtime-engine` | `https://realtime-production.up.railway.app` |
| `OPS_API_ORIGIN` | `services/hweld-operations-api` | `https://operations-api-production.up.railway.app` |

São URLs públicas, não segredos — ficam em `vars`, não em `wrangler secret`.

## Guarda de borda — `EDGE_TOKEN`

Os hostnames `*.up.railway.app` são públicos: sem proteção, quem descobrir a
origem bate direto na API, ignorando a edge. A guarda fecha isso:

- o Worker injeta `x-edge-token: <segredo>` em todo request ao origin
  (`set()` sobrescreve valor forjado pelo cliente);
- cada serviço (Rust/Java/Phoenix) rejeita **403** requests sem o token —
  exceções: probes de saúde (`/health`, `/ready`, `/actuator/**`) e rotas
  com auth própria (`/api/v1/internal/**`, `/ingest`, `/dashboard`, `/monitor`).

```bash
# Mesmo valor nos dois workers E nas três origens Railway:
TOKEN=$(openssl rand -hex 32)
npx wrangler secret put EDGE_TOKEN -c wrangler.jsonc --env production        # hweld-loja
npx wrangler secret put EDGE_TOKEN -c wrangler.admin.jsonc --env production  # hweld-admin
# Railway → cada serviço:
railway variable set -s core-api EDGE_TOKEN=$TOKEN
railway variable set -s operations-api EDGE_TOKEN=$TOKEN
railway variable set -s realtime-engine EDGE_TOKEN=$TOKEN
# GitHub Actions (specs E2E batem direto nas origens):
#   gh secret set E2E_EDGE_TOKEN --body "$TOKEN"
```

Ordem segura de rollout: origens primeiro (guarda desligada sem a var),
depois os workers, por último conferir o smoke `e2e-producao`.

## Domínio próprio

1. Registrar o domínio (Hostinger/Registro.br) e **mover a zona DNS para o
   Cloudflare** (trocar os nameservers no registrador).
2. Em `wrangler.jsonc` / `wrangler.admin.jsonc` → `env.production`,
   descomentar `routes` com o padrão `custom_domain` — ex.:
   `app.hweld.com.br` (loja) e `admin.hweld.com.br` (painel).
3. Atualizar: `CORS_ORIGINS` no core-api/realtime, `E2E_WEB_URL`/
   `E2E_ADMIN_URL` no `e2e-producao.yml`, `PHX_HOST` no realtime, e a URL
   de webhook registrada nos provedores (`FOCUS_NFE_WEBHOOK_URL`, PSPs).
4. Redeployar os workers e validar certificado (Cloudflare emite
   automaticamente para zonas próprias).

## Deploy

```bash
# Loja (apps/web)
npm run deploy              # build do Angular + deploy (config top-level)
npm run deploy:staging      # → hweld-loja-staging
npm run deploy:production   # → hweld-loja

# Painel admin (apps/painel-admin)
npm run deploy:admin              # config top-level do wrangler.admin.jsonc
npm run deploy:admin:staging      # → hweld-admin-staging
npm run deploy:admin:production   # → hweld-admin
```

Cada env gera `https://<name>.<conta>.workers.dev`. Para domínio próprio,
descomentar `routes` em `env.production` (a zona precisa estar no Cloudflare).

## Headers de cache

`apps/web/public/_headers` e `apps/painel-admin/public/_headers` são copiados
para o `dist/` no build e aplicados pelos static assets: bundles com hash
recebem cache imutável de 1 ano; `index.html` fica `no-cache`; imagens sem
hash recebem 1 dia + stale-while-revalidate.

## Env vars de build

- `apps/web` (Angular): same-origin já é o default em
  `src/environments/environment.prod.ts` (`apiUrl='/api/v1'`,
  `realtimeUrl=''`).
- `apps/painel-admin` (Vite): `apps/painel-admin/.env.production` define
  `VITE_HW_API_URL=/api/v1` e `VITE_HW_REALTIME_URL=` (vazio = same-origin,
  mesmo comportamento do proxy `/events` do `vite.config.ts` em dev).
