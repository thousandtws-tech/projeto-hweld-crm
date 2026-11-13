# Backup & Restore — Postgres (Railway)

## Arquitetura atual

- **Postgres**: instância única no Railway (compartilhada por core-api,
  operations-api e realtime-engine) — **SPOF conhecido**.
- **Backup**: workflow `backup-postgres.yml` — `pg_dump --format=custom`
  diário às 04:00 BRT → `s3://hweld-backups/postgres/` no MinIO do Railway.
- **Retenção**: 30 dias rolling no próprio workflow.

## Setup inicial (uma vez)

1. Criar o bucket `hweld-backups` no MinIO de produção (mesmo serviço do
   `bucket-production-e903`, bucket separado dos uploads/fiscal).
2. GitHub → Settings → Secrets:
   - `BACKUP_DATABASE_URL` — string de conexão completa (Railway → Postgres
     → Connect). **Preferir usuário somente-leitura** se o addon permitir.
   - `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET=hweld-backups`,
     `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY`.
3. Rodar `workflow_dispatch` uma vez e conferir o objeto no bucket.

## Restore (procedimento)

```bash
# 1. Baixar o dump desejado
aws --endpoint-url $S3_ENDPOINT s3 cp \
  s3://hweld-backups/postgres/hweld-AAAAMMDDTHHMMSSZ.dump ./restore.dump

# 2. Restaurar em banco LIMPO (nunca sobre produção direto sem congelar escrita)
pg_restore "$RESTORE_DATABASE_URL" \
  --format=custom --no-owner --no-privileges --clean --if-exists \
  --jobs=4 ./restore.dump
```

Ordem de operação em incidente real:
1. Congelar escrita (derrubar deploys, pausar outbox relay).
2. Restaurar em **nova instância** Railway Postgres (nunca in-place).
3. Apontar `DATABASE_URL`/`DB_*` dos três serviços para a nova instância.
4. Validar readiness (`/ready`, `/actuator/health`) + smoke manual.
5. Desligar a instância antiga.

## Teste de restore — obrigatório por NFR

- **Cadência**: a cada sprint (ou mensal) — restaurar em banco local/staging
  e validar contagens de tabelas-chave (`pedidos`, `pagamentos`,
  `notas_fiscais`, `payment_transactions`).
- **Sem restore testado, não existe backup** — um `.dump` que nunca foi
  restaurado é uma esperança, não um plano.
- RTO alvo: < 1h. RPO: 24h (diário) — se o negócio pedir RPO menor,
  avaliar WAL archiving ou replica.

## Avaliação de HA (registro da decisão)

| Opção | Custo | Notas |
|---|---|---|
| **Status quo** — single instance + backup diário | $0 | RPO 24h, RTO ~1h. Aceitável em estágio atual, documentado como risco. |
| Railway volume + snapshots | ~$5/mês | Snapshots de volume ≠ backup lógico; complementa, não substitui pg_dump. |
| Réplica read-only (Railway private network) | ~2× Postgres | Failover manual; sem auto-promotion — meia-HA. |
| Managed Postgres HA externo (Neon/Supabase/Crunchy) | $$ | RPO quase zero, failover real — avaliar quando receita justificar. |
| PITR (WAL shipping p/ MinIO) | $$ | RPO ~5min; complexidade de operação alta p/ o estágio. |

**Decisão atual**: backup diário + restore testado por sprint. Revisitar
HA quando: volume > N transações/dia ou primeiro incidente de indisponível
prolongado.

## Alertas

- Falha do workflow notifica via GitHub (email do autor do run). Para
  visibilidade proativa, considerar healthcheck externo (cronitor/betterstack)
  apontando para o último artefato do bucket.
