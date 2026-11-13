# Runbook — produção hweld-crm

Checklist operacional dos itens que **não são código**: configurações de
infraestrutura que exigem ação manual no painel do provedor.

## 1. Restringir origins da Railway à borda Cloudflare

Hoje `*.up.railway.app` responde diretamente, bypassando o worker —
isso permite spoofar `x-real-ip`/`x-forwarded-for` (que o rate limit e
logs de auditoria confiam) e pular qualquer regra de borda.

**Ação (Cloudflare → Security → WAF → Rules):** regra `Block` em requests
para `*.railway.app`/`*.up.railway.app` **fora** dos IPs de egress
Cloudflare. Alternativa mais fraca: regra `Allow` só do range de IPs do
worker — CF publica a lista em `https://www.cloudflare.com/ips/`.

Validação depois: `curl https://core-api-production-5553.up.railway.app/health`
de fora do worker deve falhar; via `hweld-admin.*.workers.dev` deve dar 200.

## 2. PostgreSQL — backup e HA

Railway Postgres é **single instance** — único ponto de falha de todo o
sistema (core + operations + realtime dependem dela).

**Ação:**
- Habilitar backup agendado no plugin Railway Postgres (retention ≥ 7 dias),
  ou exportar `pg_dump` diário para o MinIO `hweld-uploads/backup/` via job.
- Avaliar upgrade para Railway Postgres HA / primário+réplica — protege
  contra falha de nó e permite failover sem downtime de deploy.
- Teste de restore trimestral (backup que nunca foi restaurado não existe).

## 3. Realtime engine — replay de eventos

Clientes SSE que reconectam perdem eventos entre desconexão e rejoin
(PubSub em memória, sem log). Aceitável para notificações não-críticas;
**não** aceitável se algum consumidor depender de completude.

**Ação quando necessário:**
- Suportar `Last-Event-ID` + buffer circular por canal (ring de ~1k eventos
  no Phoenix ou stream PostgreSQL `LISTEN/NOTIFY` com id sequencial).
- Alternativa: outbox polling como fallback — o admin já tem `/auditoria`.

## 4. Secrets — inventário obrigatório

| Serviço | Variáveis | Falha se ausente |
|---|---|---|
| core-api | `DATABASE_URL`, `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN`, `MINIO_*` | boot 503 (fail-fast) |
| operations-api | `DATABASE_URL`, `JWT_SECRET`, `INTERNAL_SERVICE_TOKEN`, `PAYMENT_STUB_WEBHOOK_SECRET`, `MINIO_*`, `API_DOCS_ENABLED=false` | boot falha |
| realtime | `MOTOR_INGEST_TOKEN` | ingest 401 |

Renovação de segredo: rodar `uip`/Railway `variables set` + redeploy.
`JWT_SECRET` novo invalida sessões ativas (refresh morre) — agendar fora
de pico.

## 5. `deliv.json` no histórico git

O arquivo foi removido do index mas permanece no histórico com PII de
clientes. Limpeza **destrutiva** (reescreve história — todos os clones
precisam refazer):

```bash
pip install git-filter-repo   # ou git filter-branch
git filter-repo --path deliv.json --invert-paths
git push --force origin main
```

Só fazer com todo o time alinhado — PRs abertos e clones locais quebram.

## 6. Segredos de teste no GitHub

`.github/workflows/e2e-producao.yml` e `deploy.yml` precisam de:

```
E2E_ADMIN_EMAIL, E2E_ADMIN_SENHA       # login staff de produção
E2E_WEBHOOK_SECRET                     # = PAYMENT_STUB_WEBHOOK_SECRET
E2E_MOTOR_INGEST_TOKEN                 # = MOTOR_INGEST_TOKEN
RAILWAY_TOKEN                          # deploy automation (opcional)
CLOUDFLARE_API_TOKEN                   # deploy workers (opcional)
```

Settings → Secrets and variables → Actions → New repository secret.
