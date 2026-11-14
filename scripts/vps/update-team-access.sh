#!/usr/bin/env bash
# Run on the VPS only after reviewing docs/CORRECCION_USUARIOS_SAAS.md.
set -euo pipefail
umask 077
SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RELEASE_DIR="${1:-/opt/restoapp/restoapp-vps-20261026}"
TAG="users-$(git -C "$SOURCE_ROOT" rev-parse --short HEAD)"
test -f "$RELEASE_DIR/.env.vps"
test -f "$RELEASE_DIR/docker-compose.caddy.yml"
cd "$SOURCE_ROOT"
docker build --platform linux/amd64 --build-arg APP_NAME=servicio-identidad \
  -t "restoapp/servicio-identidad:$TAG" -f Dockerfile .
docker build --platform linux/amd64 --build-arg VITE_API_BASE_URL= \
  --build-arg VITE_TENANT_BASE_DOMAIN=restoapp.mavricitas.com \
  -t "restoapp/pwa-cliente:$TAG" -f apps/pwa-cliente/Dockerfile .

cd "$RELEASE_DIR"
COMPOSE=(docker compose --env-file .env.vps -f docker-compose.yml -f docker-compose.caddy.yml)
# Keep using the active hotfix overlay on repeat runs, including for the backup.
if test -f docker-compose.users.yml; then COMPOSE+=(-f docker-compose.users.yml); fi
BACKUP_DIR="$RELEASE_DIR/backups/team-access-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
"${COMPOSE[@]}" exec -T db-identidad sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BACKUP_DIR/identidad.dump"
test -s "$BACKUP_DIR/identidad.dump"
"${COMPOSE[@]}" exec -T db-identidad sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$BACKUP_DIR/before.csv" <<'SQL'
COPY (SELECT u.id, u."sedeId", s."tenantId", EXISTS (SELECT 1 FROM membresias m WHERE m."usuarioId"=u.id) AS tiene_membresia FROM "Usuario" u LEFT JOIN sedes s ON s.id=u."sedeId") TO STDOUT WITH CSV HEADER;
SQL
if test -f docker-compose.users.yml; then cp -p docker-compose.users.yml "$BACKUP_DIR/previous-overlay.yml"; fi
cat > docker-compose.users.yml <<EOF
services:
  servicio-identidad:
    image: restoapp/servicio-identidad:$TAG
  pwa-cliente:
    image: restoapp/pwa-cliente:$TAG
EOF
COMPOSE=(docker compose --env-file .env.vps -f docker-compose.yml -f docker-compose.caddy.yml -f docker-compose.users.yml)
"${COMPOSE[@]}" config --quiet
echo "Backup completed: $BACKUP_DIR. Updating identity and frontend."
"${COMPOSE[@]}" up -d --no-deps --wait --wait-timeout 300 servicio-identidad pwa-cliente
"${COMPOSE[@]}" exec -T db-identidad sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$BACKUP_DIR/after.csv" <<'SQL'
COPY (SELECT u.id, u."sedeId", s."tenantId", EXISTS (SELECT 1 FROM membresias m WHERE m."usuarioId"=u.id) AS tiene_membresia FROM "Usuario" u LEFT JOIN sedes s ON s.id=u."sedeId") TO STDOUT WITH CSV HEADER;
SQL
"${COMPOSE[@]}" exec -T db-identidad sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT "tenantId", count(*) AS cuentas_reparadas FROM "AuditoriaLog" WHERE accion='REPARAR_MEMBRESIA_EQUIPO' GROUP BY "tenantId";
SQL
"${COMPOSE[@]}" ps servicio-identidad pwa-cliente
echo 'Keep -f docker-compose.users.yml in future Compose commands.'
