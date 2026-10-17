# Infra — Railway (backends)

Deploy dos serviços backend no Railway (CLI `railway`, logado como
ThousandTWS Engineering).

## Topologia

```
projeto Railway: hweld-crm  (workspace clarituz-workspace)
├── Postgres              (plugin oficial — postgres.railway.internal:5432)
├── core-api              (Rust/Actix — Dockerfile)
│     público:  https://core-api-production-5553.up.railway.app  (:8080)
│     privado:  core-api.railway.internal:8080
├── operations-api        (Java 25/Spring Boot — services/hweld-operations-api/Dockerfile)
│     público:  https://operations-api-production-d580.up.railway.app  (:$PORT)
│     privado:  operations-api.railway.internal
│     banco:    MESMO Postgres do core-api (tabelas payments/outbox/etc.
│               convivem no schema public; Flyway migra no boot)
│     healthcheck: /actuator/health (railway.json)
├── realtime-engine       (Phoenix — services/realtime-engine/Dockerfile)
│     público:  https://realtime-engine-production-081f.up.railway.app  (:4100)
│     privado:  realtime-engine.railway.internal:4100
│     domínio com target port explícito 4100 (app não usa $PORT default 8080)
└── elasticsearch         (imagem oficial 8.19.0 via infra/docker/elasticsearch)
      privado apenas: elasticsearch.railway.internal:9200 (sem domínio público)
      volume: elasticsearch-volume → /usr/share/elasticsearch/data
      xpack.security.enabled=false — acesso só via private networking
```

## Variáveis por serviço

### `core-api` (obrigatórias em **bold**)

| Var | Valor |
|---|---|
| **`DATABASE_URL`** | `${{Postgres.DATABASE_URL}}` (referência ao plugin) |
| **`JWT_SECRET`** | segredo gerado — assina tokens staff/portal |
| `ENVIRONMENT` | `production` |
| `RUN_MIGRATIONS` | `true` — aplica migrations sqlx no boot |
| `SEED_ADMIN` | `true` — cria admin inicial (ver `ADMIN_*`) |
| `ADMIN_EMAIL` / `ADMIN_SENHA` / `ADMIN_NOME` | credencial inicial do painel |
| `CORS_ORIGINS` | origens dos fronts (workers.dev), separadas por vírgula |
| `DB_MAX_CONNECTIONS` | `20` |
| `MOTOR_URL` + `MOTOR_INGEST_TOKEN` | URL interna do realtime-engine + segredo do `/ingest`. **Sem token, eventos são descartados com log** — a API funciona sem o motor |
| `ELASTICSEARCH_*` | opcional — sem `ELASTICSEARCH_URL` a busca fica desligada |
| `PORT` | **não definir** — o Railway injeta automaticamente |

A lista completa com defaults está em `services/core-api/.env.example` e em
`env/core-api.env.example` aqui.

### `realtime-engine` (obrigatórias em **bold**)

| Var | Valor |
|---|---|
| **`SECRET_KEY_BASE`** | segredo gerado (`openssl rand -hex 64`) — cookies/sessões |
| **`JWT_SECRET`** | **o mesmo** do core-api — valida tokens HS256 staff/portal |
| **`MOTOR_INGEST_TOKEN`** | segredo compartilhado — core-api autentica no `/ingest` |
| `MOTOR_PORT` | `4100` — porta do Bandit (ver também o domínio: target port 4100) |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — resolver contato→empresa (Postgrex) |
| `RUST_API_URL` | `http://core-api.railway.internal:8080/api/v1` — valida login staff |
| `PHX_HOST` | domínio público do serviço (`*.up.railway.app`) |
| `CORS_ORIGINS` | origens dos fronts, separadas por vírgula |

E o contraponto no **core-api**:

```
MOTOR_URL=http://realtime-engine.railway.internal:4100
MOTOR_INGEST_TOKEN=<mesmo segredo>
```

Sem `MOTOR_INGEST_TOKEN` o `/ingest` responde 401; sem `MOTOR_URL`/`token` no
core-api os eventos são descartados com log (não quebra a API).

Template em `env/realtime-engine.env.example`.

### `operations-api` (obrigatórias em **bold**)

| Var | Valor |
|---|---|
| **`JWT_SECRET`** | **o mesmo** do core-api — valida tokens HS256 staff/portal |
| **`INTERNAL_SERVICE_TOKEN`** | segredo compartilhado — **precisa existir nos DOIS serviços**. O Java entrega `PaymentConfirmed` etc. em `POST {CORE_API_URL}/api/v1/internal/eventos-financeiros` com `X-Service-Token`. Sem a var no core-api o endpoint responde 503. |
| **`CORE_API_URL`** | `http://core-api.railway.internal:8080` — o Java busca pedidos e valida posse repassando o JWT do chamador |
| `DB_*` | referências `${{Postgres.PG*}}` — mesmo banco do core-api |
| `EMAIL_PROVIDER` | `log` até haver SMTP real (`smtp` + `SMTP_*`) |
| `PAYMENT_PROVIDER` | `stub` até credenciais de PSP |
| `FISCAL_PROVIDER` / `FISCAL_AUTO_EMIT` | `stub` / `false` — emissão real exige provider credenciado |
| `PORT` | **não definir** — o Railway injeta; `server.port=${PORT:8090}` resolve |

Template em `env/operations-api.env.example`.

## Comandos

```bash
cd infra/railway
railway status                      # projeto/ambiente linkados
railway logs --service core-api     # logs do serviço
railway variable list -s core-api   # variáveis

# Redeploy manual do código local (os dirs estão linkados aos serviços):
cd ../../services/hweld-core-api && railway up
cd ../../services/hweld-realtime-engine && railway up
cd ../../services/hweld-operations-api && railway up
```

## Pós-deploy

1. `railway domain --service core-api` → gera `*.up.railway.app`
2. Conferir `GET https://<domínio>/health` → `{"status":"ok"}` (ou equivalente)
3. Atualizar `CORE_API_ORIGIN` em `infra/cloudflare/wrangler.jsonc` e
   `wrangler.admin.jsonc` (`env.production`) e rodar
   `npm run deploy:production && npm run deploy:admin:production` em
   `infra/cloudflare` — o proxy same-origin `/api/*` passa a apontar para a API real.

## Custos / observações

- O build nixpacks compila o workspace Cargo em release — primeiro deploy é
  lento (~10-20 min); builds seguintes usam cache de layers.
- O Postgres do Railway expõe `DATABASE_URL` interna (private networking) —
  a referência `${{Postgres.DATABASE_URL}}` resolve dentro do projeto.
- Elasticsearch: volumes do Railway montam root-owned e o ES roda como uid
  1000 → `infra/docker/elasticsearch/` tem um Dockerfile wrapper (entrypoint
  faz `chown` no volume como root e dropa privilégio via `su`). Deploy:
  `cd infra/docker/elasticsearch && railway up`. Índice é recriado pelo
  core-api no boot (`ES_ENSURE_INDEX`) e repovoado via
  `POST /api/v1/busca/reindexar` (staff).
- `SEED_ADMIN=true` só cria o admin se ele não existir; manter ligado é seguro,
  mas trocar `ADMIN_SENHA` após o primeiro login.
