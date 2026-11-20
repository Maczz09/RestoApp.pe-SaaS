#!/usr/bin/env bash
# See docs/RESTOAPP_V2_IMPLEMENTACION.md before applying to a live restaurant.
set -euo pipefail
umask 077
SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RELEASE_DIR="${2:-/opt/restoapp/restoapp-vps-20261026}"
DOMAIN="${RESTOAPP_DOMAIN:-restoapp.mavricitas.com}"
REVISION="$(git -C "$SOURCE_ROOT" rev-parse HEAD)"
TAG="saas-v2-${REVISION:0:12}"
IMAGE_MODE="${3:---build}"
[[ "$IMAGE_MODE" == --build || "$IMAGE_MODE" == --use-loaded-images ]] || { echo 'Use --build or --use-loaded-images as the third argument' >&2; exit 1; }
SERVICES=(identidad mesas pedidos cuentas reservas inventario notificaciones caja reportes facturacion compras)
APPS=()
for service in "${SERVICES[@]}"; do APPS+=("servicio-$service"); done

if [[ "${1:---plan}" != --apply ]]; then
  printf 'Source: %s\nRelease: %s\nImages: restoapp/*:%s (linux/amd64)\nDomain: %s\n' "$SOURCE_ROOT" "$RELEASE_DIR" "$TAG" "$DOMAIN"
  printf '%s\n' 'Plan: build images; pause only RestoApp; back up 11 databases and purchase attachments; start updated services; start gateway last.'
  printf '%s\n' 'The existing Caddy and Agendly containers are not changed.'
  printf 'Apply after review: bash %q --apply %q\n' "$SOURCE_ROOT/scripts/vps/update-saas-v2.sh" "$RELEASE_DIR"
  exit 0
fi
[[ "$DOMAIN" =~ ^[a-z0-9.-]+$ ]] || { echo 'Invalid SaaS domain' >&2; exit 1; }
test -f "$RELEASE_DIR/.env.vps"
test -f "$RELEASE_DIR/docker-compose.yml"
test -f "$RELEASE_DIR/docker-compose.caddy.yml"
exec 9>"$RELEASE_DIR/.saas-v2-update.lock"
flock -n 9 || { echo 'Another update is running' >&2; exit 1; }
COMPOSE=(docker compose --project-directory "$RELEASE_DIR" --env-file "$RELEASE_DIR/.env.vps" -f "$RELEASE_DIR/docker-compose.yml" -f "$RELEASE_DIR/docker-compose.caddy.yml")
if test -f "$RELEASE_DIR/docker-compose.users.yml"; then COMPOSE+=(-f "$RELEASE_DIR/docker-compose.users.yml"); fi
if test -f "$RELEASE_DIR/docker-compose.saas-v2.yml"; then COMPOSE+=(-f "$RELEASE_DIR/docker-compose.saas-v2.yml"); fi
"${COMPOSE[@]}" config --quiet
PENDING=$("${COMPOSE[@]}" exec -T db-caja sh -c 'psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT CASE WHEN to_regclass('public.pagos_pendientes') IS NULL THEN 'SELECT 0'
ELSE 'SELECT count(*) FROM pagos_pendientes WHERE estado IN (''PENDIENTE'',''PROCESANDO'')' END
\gexec
SQL
)
[[ "$PENDING" =~ ^[0-9]+$ ]] || { echo 'Could not verify legacy pending payments' >&2; exit 1; }
[[ "$PENDING" == 0 ]] || { echo 'Resolve queued legacy payments by opening their cash shifts before upgrading. No services were stopped.' >&2; exit 1; }
cd "$SOURCE_ROOT"
if [[ "$IMAGE_MODE" == --use-loaded-images ]]; then
  # A tag alone is mutable. Require the exact source revision and target platform.
  for app in "${APPS[@]}" pwa-cliente kong; do
    metadata=$(docker image inspect "restoapp/$app:$TAG" --format '{{.Os}}/{{.Architecture}} {{index .Config.Labels "org.opencontainers.image.revision"}}')
    [[ "$metadata" == "linux/amd64 $REVISION" ]] || { echo "Wrong revision or platform: restoapp/$app:$TAG" >&2; exit 1; }
  done
else
for app in "${APPS[@]}"; do
  docker build --platform linux/amd64 --label "org.opencontainers.image.revision=$REVISION" \
    --build-arg "APP_NAME=$app" -t "restoapp/$app:$TAG" -f Dockerfile .
done
docker build --platform linux/amd64 --label "org.opencontainers.image.revision=$REVISION" \
  --build-arg VITE_API_BASE_URL= --build-arg "VITE_TENANT_BASE_DOMAIN=$DOMAIN" \
  -t "restoapp/pwa-cliente:$TAG" -f apps/pwa-cliente/Dockerfile .
docker build --platform linux/amd64 --label "org.opencontainers.image.revision=$REVISION" -t "restoapp/kong:$TAG" -f infra/kong/Dockerfile infra/kong
fi

BACKUP_DIR="$RELEASE_DIR/backups/saas-v2-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
"${COMPOSE[@]}" config > "$BACKUP_DIR/previous-compose.yml"
for overlay in docker-compose.users.yml docker-compose.saas-v2.yml; do
  if test -f "$RELEASE_DIR/$overlay"; then cp -p "$RELEASE_DIR/$overlay" "$BACKUP_DIR/$overlay"; fi
done
printf '%s\n' "$REVISION" > "$BACKUP_DIR/source-revision.txt"
PAUSED=false
trap 'rc=$?; if [[ "$PAUSED" == true ]]; then printf "Update stopped (code %s). RestoApp gateway remains stopped. Backups: %s\n" "$rc" "$BACKUP_DIR" >&2; fi; exit "$rc"' EXIT
# Quiesce all writers and consumers before the cross-service snapshot.
"${COMPOSE[@]}" stop kong "${APPS[@]}" pwa-cliente
PAUSED=true
for service in "${SERVICES[@]}"; do
  "${COMPOSE[@]}" exec -T "db-$service" sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$BACKUP_DIR/$service.dump"
  test -s "$BACKUP_DIR/$service.dump"
done
# Compose run mounts the existing purchase volume without starting dependencies.
"${COMPOSE[@]}" run --rm --no-deps --entrypoint sh servicio-compras -c 'tar -C /data -czf - comprobantes' > "$BACKUP_DIR/comprobantes.tar.gz"
test -s "$BACKUP_DIR/comprobantes.tar.gz"

OVERLAY="$RELEASE_DIR/docker-compose.saas-v2.yml"
printf 'services:\n' > "$OVERLAY.next"
for app in "${APPS[@]}" pwa-cliente kong; do
  printf '  %s:\n    image: restoapp/%s:%s\n' "$app" "$app" "$TAG" >> "$OVERLAY.next"
done
mv "$OVERLAY.next" "$OVERLAY"
COMPOSE=(docker compose --project-directory "$RELEASE_DIR" --env-file "$RELEASE_DIR/.env.vps" -f "$RELEASE_DIR/docker-compose.yml" -f "$RELEASE_DIR/docker-compose.caddy.yml")
if test -f "$RELEASE_DIR/docker-compose.users.yml"; then COMPOSE+=(-f "$RELEASE_DIR/docker-compose.users.yml"); fi
COMPOSE+=(-f "$OVERLAY")
"${COMPOSE[@]}" config --quiet
# Entrypoints apply each service's additive Prisma migrations before listening.
"${COMPOSE[@]}" up -d --no-deps --wait --wait-timeout 600 "${APPS[@]}" pwa-cliente
"${COMPOSE[@]}" up -d --no-deps --wait --wait-timeout 180 kong
PAUSED=false
"${COMPOSE[@]}" ps
printf 'Updated %s. Backups: %s\n' "$TAG" "$BACKUP_DIR"
printf '%s\n' 'Keep docker-compose.saas-v2.yml last in future Compose commands. Verify the restaurant before resuming orders.'
