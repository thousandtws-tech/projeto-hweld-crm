# Migração Railway → OCI (São Paulo)

Stack completa self-hosted numa VM Ampere A1 (`sa-saopaulo-1`).
Objetivo: latência BR ~10-30ms + $0 (free tier) — troca-se conveniência
gerenciada por controle operacional (você vira o SRE).

## 0. Por que / custo

| | Railway (ams) | OCI (são paulo) |
|---|---|---|
| RTT de cliente BR | ~200-350ms | ~10-30ms |
| Custo/mês | consumo por serviço | $0 free tier (4 CPU Arm + 24 GB) |
| Postgres/ES/MinIO | managed | self-managed (você opera) |
| SLA | sim | nenhum no free tier |

Risco principal do free tier: **capacidade de `sa-saopaulo-1` esgota** —
se a VM não provisionar, tentar em janelas diferentes ou upgrade pago.

## 1. Provisionar a VM

1. Console OCI → Compute → Instances → Create:
   - Image: **Ubuntu 22.04 aarch64** (ou `Canonical-Ubuntu-22.04-aarch64`)
   - Shape: **VM.Standard.A1.Flex** — 4 OCPU / 24 GB (always free)
   - Networking: VCN com subnet pública + IP público
   - Security list: abrir **22 (SSH), 80, 443** — nada mais
2. Anotar o IP público.

## 2. Preparar o host

```bash
ssh ubuntu@<IP>
# Docker + compose plugin
sudo apt update && sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker ubuntu && newgrp docker

# Clone e env
sudo mkdir -p /opt/hweld && sudo chown ubuntu /opt/hweld
cd /opt/hweld && git clone <repo> .
cd infra/oci && cp .env.example .env
# Preencher .env — segredos novos, NÃO os do Railway (gerar todos de novo)
```

## 3. DNS

Registros `A` no provedor de DNS (sem proxy CF — DNS-only para aproveitar
a baixa latência direta):

```
api.seudominio.com.br  →  <IP da VM>
ops.seudominio.com.br  →  <IP da VM>
rt.seudominio.com.br   →  <IP da VM>
```

Editar `Caddyfile` trocando `seudominio.com.br` pelo domínio real.

## 4. Subir

```bash
cd /opt/hweld/infra/oci
docker compose --env-file .env up -d --build   # build leva ~15-25min na 1ª vez
docker compose ps                              # todos healthy/running
docker compose logs -f caddy                   # certificados emitindo
```

## 5. Smoke pós-subida

```bash
curl https://api.seudominio.com.br/health            # → 200
curl https://ops.seudominio.com.br/actuator/health   # → {"status":"UP"}
curl https://rt.seudominio.com.br/health             # → 200
```

## 6. Cutover (apontar frontends/integrações)

Os workers CF mudam as origins:

```
infra/cloudflare/wrangler.admin.jsonc → env.production:
  CORE_API_ORIGIN = https://api.seudominio.com.br
  OPS_API_ORIGIN  = https://ops.seudominio.com.br
  REALTIME_ORIGIN = https://rt.seudominio.com.br

wrangler deploy -c wrangler.admin.jsonc --env production
wrangler deploy -c wrangler.jsonc --env production
```

E o `.env.e2e` das suítes aponta para as novas URLs para revalidar.

## 7. Migração de dados (quando aplicável)

```bash
# Railway → dump
pg_dump "$RAILWAY_DATABASE_URL" > hweld-railway.sql
# OCI → restore (com compose parado ou base vazia)
cat hweld-railway.sql | docker exec -i hweld-postgres psql -U hweld hweld
```

Cuidado: dados criados em prod entre dump e cutover se perdem — usar
janela de manutenção ou desligar o Railway durante o restore.

## 8. Operação diária

- `backup.sh` no cron (04:00 diário) → `hweld-backups` no MinIO
- Logs: `docker compose logs -f <serviço>`
- Update: `git pull && docker compose up -d --build <serviço>`
- Sem rollback automático — manter tag/imagem anterior ou manter
  Railway parado (não deletado) por 2-4 semanas como plano B.

## 9. Rollback rápido

Voltar as origins dos workers para `*.up.railway.app` e religar os
serviços no Railway. O cutover é reversível enquanto o Railway existir.
