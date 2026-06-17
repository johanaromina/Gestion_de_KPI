#!/usr/bin/env bash
# Uso: ./deploy.sh
# Ejecutar desde: /opt/kpimanager (como root)

set -euo pipefail

DB_USER="gestion_kpi"
DB_NAME="gestion_kpi"
COMPOSE_FILE="docker-compose.prod.yml"
DEMO_ENV=".env.demo"
PRUEBA_ENV=".env.prueba"
BACKEND_IMAGE="kpimanager/backend:shared"

trim_env_value() {
  printf '%s' "$1" | tr -d '\r' | sed "s/^['\"]//; s/['\"]$//"
}

read_env_value() {
  local file="$1"
  local key="$2"
  local line
  line=$(grep -E "^${key}=" "$file" 2>/dev/null | tail -n 1 || true)
  if [[ -z "$line" ]]; then
    printf ''
    return 0
  fi
  trim_env_value "${line#*=}"
}

read_env_value_with_default() {
  local file="$1"
  local key="$2"
  local default_value="$3"
  local value
  value=$(read_env_value "$file" "$key")
  if [[ -n "$value" ]]; then
    printf '%s' "$value"
  else
    printf '%s' "$default_value"
  fi
}

compose() {
  local env_file="$1"
  local project="$2"
  shift 2
  docker compose --env-file "$env_file" -f "$COMPOSE_FILE" -p "$project" "$@"
}

frontend_build_signature() {
  local env_file="$1"
  printf 'VITE_SELF_REGISTER_ENABLED=%s\n' \
    "$(read_env_value_with_default "$env_file" "VITE_SELF_REGISTER_ENABLED" "false")"
}

# Leer passwords desde los env files (sin hardcodear en el script)
DEMO_PASS=$(read_env_value "$DEMO_ENV" "MYSQL_PASSWORD")
PRUEBA_PASS=$(read_env_value "$PRUEBA_ENV" "MYSQL_PASSWORD")

if [[ -z "$DEMO_PASS" || -z "$PRUEBA_PASS" ]]; then
  echo "ERROR: no se encontró MYSQL_PASSWORD en .env.demo o .env.prueba"
  exit 1
fi

# ── Migraciones pendientes ────────────────────────────────────────────────────
# Agregar cada nueva migración aquí, en orden cronológico.
MIGRATIONS=(
  "backend/scripts/add-check-ins-note.sql"
  "backend/scripts/add-collaborator-kpis-period-index.sql"
)

run_migration() {
  local container="$1"
  local pass="$2"
  local script="$3"
  echo "    $container ← $script"
  docker exec -i "$container" mysql -u"$DB_USER" -p"$pass" "$DB_NAME" < "$script"
}

# ── git pull ──────────────────────────────────────────────────────────────────
echo ""
echo "=== git pull ==="
git pull

# ── Backup pre-deploy ─────────────────────────────────────────────────────────
echo ""
echo "=== Backup pre-deploy ==="
bash "$(dirname "$0")/backup.sh"

# ── Migraciones ───────────────────────────────────────────────────────────────
if [[ ${#MIGRATIONS[@]} -gt 0 ]]; then
  echo ""
  echo "=== Migraciones ==="
  for migration in "${MIGRATIONS[@]}"; do
    echo ""
    run_migration "prueba-mysql-1" "$PRUEBA_PASS" "$migration"
    run_migration "demo-mysql-1"   "$DEMO_PASS"   "$migration"
  done
else
  echo ""
  echo "=== Sin migraciones nuevas ==="
fi

# ── Backend: build único compartido ───────────────────────────────────────────
echo ""
echo "=== Build backend compartido ==="
BACKEND_IMAGE="$BACKEND_IMAGE" compose "$DEMO_ENV" demo build backend

echo ""
echo "=== Deploy backend prueba ==="
BACKEND_IMAGE="$BACKEND_IMAGE" compose "$PRUEBA_ENV" prueba up -d --no-build backend

echo ""
echo "=== Deploy backend demo ==="
BACKEND_IMAGE="$BACKEND_IMAGE" compose "$DEMO_ENV" demo up -d --no-build backend

# ── Frontend: compartido solo si el build-time config coincide ────────────────
DEMO_FRONTEND_SIG=$(frontend_build_signature "$DEMO_ENV")
PRUEBA_FRONTEND_SIG=$(frontend_build_signature "$PRUEBA_ENV")

echo ""
if [[ "$DEMO_FRONTEND_SIG" == "$PRUEBA_FRONTEND_SIG" ]]; then
  echo "=== Build frontend compartido ==="
  compose "$DEMO_ENV" demo build frontend
  docker tag demo-frontend:latest prueba-frontend:latest

  echo ""
  echo "=== Deploy frontend prueba ==="
  compose "$PRUEBA_ENV" prueba up -d --no-build frontend

  echo ""
  echo "=== Deploy frontend demo ==="
  compose "$DEMO_ENV" demo up -d --no-build frontend
else
  echo "=== Build frontend por cliente ==="
  echo "Motivo: VITE_* difiere entre demo y prueba"
  echo "demo   -> $DEMO_FRONTEND_SIG"
  echo "prueba -> $PRUEBA_FRONTEND_SIG"

  echo ""
  echo "=== Rebuild frontend prueba ==="
  compose "$PRUEBA_ENV" prueba up -d --build frontend

  echo ""
  echo "=== Rebuild frontend demo ==="
  compose "$DEMO_ENV" demo up -d --build frontend
fi

echo ""
echo "=== Listo ==="
docker ps --format "table {{.Names}}\t{{.Status}}"
