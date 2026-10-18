#!/usr/bin/env bash
# Backup diário do PostgreSQL → MinIO local (bucket hweld-backups).
# Cron no host:  0 4 * * * /opt/hweld/infra/oci/backup.sh >> /var/log/hweld-backup.log 2>&1
set -euo pipefail

STAMP="$(date +%Y%m%d-%H%M%S)"
ARQUIVO="hweld-${STAMP}.sql.gz"

echo "[backup] iniciando ${ARQUIVO}"

docker exec hweld-postgres pg_dump -U hweld hweld | gzip > "/tmp/${ARQUIVO}"

docker run --rm --network oci_internal \
  -e MC_HOST_minio="http://${MINIO_ROOT_USER:?}:${MINIO_ROOT_PASSWORD:?}@minio:9000" \
  -v "/tmp/${ARQUIVO}:/tmp/${ARQUIVO}:ro" \
  minio/mc:latest sh -c \
  "mc mb --ignore-existing minio/hweld-backups && mc cp /tmp/${ARQUIVO} minio/hweld-backups/"

rm -f "/tmp/${ARQUIVO}"
echo "[backup] concluído → minio/hweld-backups/${ARQUIVO}"

# Retenção: apaga dumps com mais de 30 dias.
docker run --rm --network oci_internal \
  -e MC_HOST_minio="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@minio:9000" \
  minio/mc:latest sh -c \
  "mc rm --recursive --force --older-than 30d minio/hweld-backups/ 2>/dev/null || true"
