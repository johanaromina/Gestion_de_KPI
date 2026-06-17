#!/usr/bin/env bash
# Uso: ./restore.sh <env> <backup_file>
# Ej:  ./restore.sh demo backups/demo_20260617_030000.sql.gz
#      ./restore.sh prueba backups/prueba_monthly_202606.sql.gz
#
# ADVERTENCIA: sobreescribe completamente la base de datos del ambiente indicado.

set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Uso: $0 <env> <backup_file>"
  echo "     env: demo | prueba"
  exit 1
fi

ENV="$1"
BACKUP_FILE="$2"
DB_USER="gestion_kpi"
DB_NAME="gestion_kpi"

# ── Validaciones ──────────────────────────────────────────────────────────────

case "$ENV" in
  demo)   ENV_FILE=".env.demo";   CONTAINER="demo-mysql-1" ;;
  prueba) ENV_FILE=".env.prueba"; CONTAINER="prueba-mysql-1" ;;
  *)
    echo "ERROR: env debe ser 'demo' o 'prueba' (recibido: '$ENV')"
    exit 1
    ;;
esac

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "ERROR: archivo de backup no encontrado: $BACKUP_FILE"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: archivo de entorno no encontrado: $ENV_FILE"
  exit 1
fi

# ── Helpers ───────────────────────────────────────────────────────────────────

trim_env_value() {
  printf '%s' "$1" | tr -d '\r' | sed "s/^['\"]//; s/['\"]$//"
}

read_env_value() {
  local file="$1" key="$2" line
  line=$(grep -E "^${key}=" "$file" 2>/dev/null | tail -n 1 || true)
  [[ -z "$line" ]] && { printf ''; return 0; }
  trim_env_value "${line#*=}"
}

PASS=$(read_env_value "$ENV_FILE" "MYSQL_PASSWORD")
[[ -z "$PASS" ]] && { echo "ERROR: MYSQL_PASSWORD vacío en $ENV_FILE"; exit 1; }

# ── Confirmación ──────────────────────────────────────────────────────────────

BACKUP_SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║  RESTAURACIÓN DE BASE DE DATOS                        ║"
echo "╠════════════════════════════════════════════════════════╣"
echo "║  Ambiente  : $ENV"
echo "║  Contenedor: $CONTAINER"
echo "║  Base      : $DB_NAME"
echo "║  Backup    : $BACKUP_FILE ($BACKUP_SIZE)"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "ADVERTENCIA: esto sobreescribe TODOS los datos actuales de '$ENV'."
echo ""
printf "Escribí 'restaurar' para confirmar: "
read -r confirm

if [[ "$confirm" != "restaurar" ]]; then
  echo "Cancelado."
  exit 0
fi

# ── Backup preventivo antes de restaurar ─────────────────────────────────────

echo ""
echo "=== Backup de seguridad pre-restauración ==="
bash "$(dirname "$0")/backup.sh" --env "$ENV"

# ── Restauración ──────────────────────────────────────────────────────────────

echo ""
echo "=== Restaurando... ==="
zcat "$BACKUP_FILE" | docker exec -i "$CONTAINER" mysql -u"$DB_USER" -p"$PASS" "$DB_NAME"

echo ""
echo "=== Restauración completada ==="
echo "    Ambiente: $ENV"
echo "    Backup aplicado: $BACKUP_FILE"
