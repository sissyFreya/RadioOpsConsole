#!/usr/bin/env bash
# RadioOps — PostgreSQL backup script
#
# Usage:
#   ./scripts/pg_backup.sh [output_dir]
#
# Defaults:
#   output_dir = ./backups
#
# The script dumps the radioops database from the running 'db' container using
# pg_dump and writes a timestamped, gzip-compressed file.
#
# Restore:
#   gunzip -c backups/radioops_20260305_120000.sql.gz | \
#     docker compose exec -T db psql -U radioops radioops

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
OUTPUT_DIR="${1:-./backups}"
DB_CONTAINER="db"

# Read credentials from environment or fall back to compose defaults
POSTGRES_USER="${POSTGRES_USER:-radioops}"
POSTGRES_DB="${POSTGRES_DB:-radioops}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="radioops_${TIMESTAMP}.sql.gz"
OUTPUT_PATH="${OUTPUT_DIR}/${FILENAME}"

mkdir -p "${OUTPUT_DIR}"

echo "[backup] Dumping database '${POSTGRES_DB}' from container '${DB_CONTAINER}'..."
docker compose -f "${COMPOSE_FILE}" exec -T "${DB_CONTAINER}" \
    pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" | gzip > "${OUTPUT_PATH}"

SIZE=$(du -sh "${OUTPUT_PATH}" | cut -f1)
echo "[backup] Done: ${OUTPUT_PATH} (${SIZE})"

# Retention: keep only the 30 most recent backups
KEEP=30
COUNT=$(ls -1 "${OUTPUT_DIR}"/radioops_*.sql.gz 2>/dev/null | wc -l)
if [ "${COUNT}" -gt "${KEEP}" ]; then
    TO_DELETE=$(( COUNT - KEEP ))
    ls -1t "${OUTPUT_DIR}"/radioops_*.sql.gz | tail -n "${TO_DELETE}" | xargs rm -f
    echo "[backup] Pruned ${TO_DELETE} old backup(s) (keeping ${KEEP})."
fi
