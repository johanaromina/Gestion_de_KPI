#!/usr/bin/env bash
# Uso: ./deploy.sh
# Ejecutar desde: /opt/kpimanager (como root)

set -euo pipefail

DB_USER="gestion_kpi"
DB_NAME="gestion_kpi"

# Leer passwords desde los env files (sin hardcodear en el script)
DEMO_PASS=$(grep '^MYSQL_PASSWORD=' .env.demo 2>/dev/null | cut -d= -f2- | tr -d "'\"")
PRUEBA_PASS=$(grep '^MYSQL_PASSWORD=' .env.prueba 2>/dev/null | cut -d= -f2- | tr -d "'\"")

if [[ -z "$DEMO_PASS" || -z "$PRUEBA_PASS" ]]; then
  echo "ERROR: no se encontró MYSQL_PASSWORD en .env.demo o .env.prueba"
  exit 1
fi

# ── Migraciones pendientes ────────────────────────────────────────────────────
# Agregar cada nueva migración aquí, en orden cronológico.
MIGRATIONS=(
  "backend/scripts/add-check-ins-note.sql"
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

# ── Rebuild ───────────────────────────────────────────────────────────────────
echo ""
echo "=== Rebuild prueba ==="
docker compose -p prueba -f docker-compose.prod.yml --env-file .env.prueba up --build -d backend frontend

echo ""
echo "=== Rebuild demo ==="
docker compose -p demo -f docker-compose.prod.yml --env-file .env.demo up --build -d backend frontend

echo ""
echo "=== Listo ==="
docker ps --format "table {{.Names}}\t{{.Status}}"
