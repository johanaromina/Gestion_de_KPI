#!/usr/bin/env bash
# Uso:   ./backup.sh [--env demo|prueba] [--keep-days N]
# Ejec.: desde /opt/kpimanager (como root o usuario con acceso a docker)
#
# Crea un dump MySQL comprimido de cada ambiente en ./backups/
# Retención: KEEP_DAYS días de backups diarios + 90 días de backups del primer día de cada mes.
#
# Para programar ejecución automática (cron):
#   0 3 * * * /opt/kpimanager/backup.sh >> /var/log/kpimanager-backup.log 2>&1

set -euo pipefail

# ── Configuración ─────────────────────────────────────────────────────────────

BACKUP_DIR="./backups"
KEEP_DAYS=14
DB_USER="gestion_kpi"
DB_NAME="gestion_kpi"
DEMO_ENV=".env.demo"
PRUEBA_ENV=".env.prueba"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
IS_MONTH_START=$([ "$(date +%d)" = "01" ] && echo "true" || echo "false")

# ── Parseo de argumentos ──────────────────────────────────────────────────────

FILTER_ENV=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)       FILTER_ENV="$2"; shift 2 ;;
    --keep-days) KEEP_DAYS="$2";  shift 2 ;;
    *) echo "Argumento desconocido: $1"; exit 1 ;;
  esac
done

# ── Helpers (mismos que deploy.sh) ───────────────────────────────────────────

trim_env_value() {
  printf '%s' "$1" | tr -d '\r' | sed "s/^['\"]//; s/['\"]$//"
}

read_env_value() {
  local file="$1" key="$2" line
  line=$(grep -E "^${key}=" "$file" 2>/dev/null | tail -n 1 || true)
  [[ -z "$line" ]] && { printf ''; return 0; }
  trim_env_value "${line#*=}"
}

# ── Función de dump ───────────────────────────────────────────────────────────

dump_db() {
  local container="$1"
  local pass="$2"
  local env_name="$3"

  local out_daily="$BACKUP_DIR/${env_name}_${TIMESTAMP}.sql.gz"

  echo "  → Dumping $env_name..."
  docker exec "$container" mysqldump \
    -u"$DB_USER" -p"$pass" \
    --single-transaction \
    --quick \
    --skip-lock-tables \
    --routines \
    --triggers \
    "$DB_NAME" \
  | gzip > "$out_daily"

  local size
  size=$(du -sh "$out_daily" | cut -f1)
  echo "    ✓ $out_daily ($size)"

  # Copia mensual: si es el primer día del mes, guardar con tag mensual
  if [[ "$IS_MONTH_START" == "true" ]]; then
    local out_monthly="$BACKUP_DIR/${env_name}_monthly_$(date +%Y%m).sql.gz"
    cp "$out_daily" "$out_monthly"
    echo "    ✓ Copia mensual: $out_monthly"
  fi
}

# ── Función de pruning ────────────────────────────────────────────────────────

prune_old_backups() {
  echo ""
  echo "=== Limpiando backups diarios > ${KEEP_DAYS} días ==="
  # Solo elimina los diarios (no los mensuales que tienen el tag _monthly_)
  find "$BACKUP_DIR" -name "*.sql.gz" \
    ! -name "*_monthly_*" \
    -mtime +"$KEEP_DAYS" \
    -delete -print | sed 's/^/  eliminado: /'

  echo "=== Limpiando backups mensuales > 90 días ==="
  find "$BACKUP_DIR" -name "*_monthly_*.sql.gz" \
    -mtime +90 \
    -delete -print | sed 's/^/  eliminado: /'
}

# ── Main ──────────────────────────────────────────────────────────────────────

mkdir -p "$BACKUP_DIR"

echo ""
echo "=== Backup DB — $(date '+%Y-%m-%d %H:%M:%S') ==="

ENVS_PROCESSED=0

if [[ -z "$FILTER_ENV" || "$FILTER_ENV" == "demo" ]]; then
  if [[ ! -f "$DEMO_ENV" ]]; then
    echo "  SKIP demo: $DEMO_ENV no encontrado"
  else
    DEMO_PASS=$(read_env_value "$DEMO_ENV" "MYSQL_PASSWORD")
    [[ -z "$DEMO_PASS" ]] && { echo "ERROR: MYSQL_PASSWORD vacío en $DEMO_ENV"; exit 1; }
    dump_db "demo-mysql-1" "$DEMO_PASS" "demo"
    ENVS_PROCESSED=$((ENVS_PROCESSED + 1))
  fi
fi

if [[ -z "$FILTER_ENV" || "$FILTER_ENV" == "prueba" ]]; then
  if [[ ! -f "$PRUEBA_ENV" ]]; then
    echo "  SKIP prueba: $PRUEBA_ENV no encontrado"
  else
    PRUEBA_PASS=$(read_env_value "$PRUEBA_ENV" "MYSQL_PASSWORD")
    [[ -z "$PRUEBA_PASS" ]] && { echo "ERROR: MYSQL_PASSWORD vacío en $PRUEBA_ENV"; exit 1; }
    dump_db "prueba-mysql-1" "$PRUEBA_PASS" "prueba"
    ENVS_PROCESSED=$((ENVS_PROCESSED + 1))
  fi
fi

[[ $ENVS_PROCESSED -eq 0 ]] && { echo "ERROR: ningún ambiente procesado"; exit 1; }

prune_old_backups

echo ""
echo "=== Backups disponibles ==="
ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null || echo "  (ninguno)"
echo ""
echo "=== Listo ==="
