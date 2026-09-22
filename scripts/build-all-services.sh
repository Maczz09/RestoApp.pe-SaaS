#!/bin/bash
set -e

# Build all microservices
SERVICES=(
  "servicio-identidad"
  "servicio-mesas"
  "servicio-pedidos"
  "servicio-cuentas"
  "servicio-reservas"
  "servicio-inventario"
  "servicio-notificaciones"
  "servicio-caja"
  "servicio-reportes"
  "servicio-facturacion"
  "servicio-compras"
)

echo "=========================================="
echo "  Docker Build — All RestoApp Services"
echo "=========================================="
echo ""

for svc in "${SERVICES[@]}"; do
  echo ">>> Building restoapp-${svc}..."
  docker build \
    --build-arg APP_NAME="${svc}" \
    -t "RestoApp-${svc}" \
    -t "restoapp-${svc}" \
    -t "infra-${svc}" \
    -f Dockerfile \
    . 2>&1 | tee -a "logs/build-${svc}.log"
  echo ">>> Done: restoapp-${svc}"
  echo ""
done

echo "=========================================="
echo "  All RestoApp services built successfully!"
echo "=========================================="
docker images | grep restoapp-
