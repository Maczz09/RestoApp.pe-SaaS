# Guia de despliegue VPS: RestoApp.pe SaaS Multitenant

Esta guia resume el despliegue de RestoApp.pe en una VPS Ubuntu 24.04, usando Docker Compose, dominio personalizado y HTTPS automatico con Caddy / reverse proxy.

Ejemplo usado:

```text
IP publica: 193.122.210.213
App:        app.restoapp.pe
API:        api.restoapp.pe
Repo:       https://github.com/Maczz09/RestoApp.pe-SaaS.git
```

## 1. Preparar la VPS

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl nano gnupg apt-transport-https ca-certificates
```

Instalar Docker:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker

docker --version
docker compose version
```

Instalar Node.js 22:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

node -v
npm -v
```

## 2. Clonar el proyecto

```bash
cd ~
git clone https://github.com/Maczz09/RestoApp.pe-SaaS.git restoapp
cd restoapp
```

Si GitHub pide password, usar un Personal Access Token. Permisos minimos con token fine-grained:

```text
Repository access: solo RestoApp.pe-SaaS
Contents: Read-only
Metadata: Read-only
```

## 3. Crear y preparar `.env`

```bash
cp .env.example .env
```

Evitar simbolos raros en passwords para Docker Compose. No usar `$`, `%`, `|`, backticks, espacios o `#` en valores.

```bash
sed -i 's|^DB_PASS=.*|DB_PASS=RestoAppDB2026Seguro123|' .env
sed -i 's|^RABBITMQ_PASS=.*|RABBITMQ_PASS=RabbitRestoApp2026Seguro123|' .env
sed -i 's|^SERVICE_JWT_SECRET=.*|SERVICE_JWT_SECRET=ServiceJwtRestoApp2026SeguroMuyLargo123456789|' .env
sed -i 's|^GRAFANA_PASS=.*|GRAFANA_PASS=GrafanaRestoApp2026Seguro123|' .env
```

Instalar dependencias y generar claves JWT:

```bash
npm ci
node scripts/generate-jwt-keys.mjs > /tmp/keys.txt
cat /tmp/keys.txt
```

Aplicar claves al `.env`:

```bash
grep '^JWT_PRIVATE_KEY=' /tmp/keys.txt > /tmp/jwt.env
grep '^JWT_PUBLIC_KEY=' /tmp/keys.txt >> /tmp/jwt.env
grep '^JWT_PUBLIC_KEY=' /tmp/keys.txt | sed 's/^JWT_PUBLIC_KEY=/KONG_JWT_PUBLIC_KEY=/' >> /tmp/jwt.env

grep -v '^JWT_PRIVATE_KEY=' .env | grep -v '^JWT_PUBLIC_KEY=' | grep -v '^KONG_JWT_PUBLIC_KEY=' > /tmp/env.clean
cat /tmp/env.clean /tmp/jwt.env > .env
```

Configurar CORS final:

```bash
sed -i 's|^CORS_ORIGIN=.*|CORS_ORIGIN=https://app.restoapp.pe|' .env
sed -i 's|^KONG_CORS_ORIGINS=.*|KONG_CORS_ORIGINS=["https://app.restoapp.pe"]|' .env
```

## 4. Construir imagenes backend (nomenclatura RestoApp-<microservicio>)

```bash
cd ~/restoapp

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

for svc in "${SERVICES[@]}"; do
  docker build --build-arg APP_NAME="$svc" -t "RestoApp-$svc" -t "restoapp-$svc" -t "restoapp/$svc:latest" -f Dockerfile .
done
```

Verificar:

```bash
docker images | grep -E 'RestoApp-|restoapp-'
```

## 5. Construir Kong

```bash
cd ~/restoapp/infra
docker compose --env-file ../.env -f docker-compose.prod.yml build kong
```

## 6. Levantar backend, bases, RabbitMQ y Kong

Primera instalacion:

```bash
cd ~/restoapp/infra
docker compose --env-file ../.env -f docker-compose.prod.yml down -v --remove-orphans
docker compose --env-file ../.env -f docker-compose.prod.yml up -d
```

Verificar estado:

```bash
docker compose --env-file ../.env -f docker-compose.prod.yml ps
```

Los `db-*`, `rabbitmq`, `kong` y `servicio-*` deben quedar `healthy`.

Logs de diagnostico:

```bash
docker compose --env-file ../.env -f docker-compose.prod.yml logs --tail=120 servicio-identidad
```

## 7. Construir y levantar PWA Cliente

```bash
cd ~/restoapp

docker build \
  -f apps/pwa-cliente/Dockerfile \
  --build-arg VITE_API_BASE_URL=https://api.restoapp.pe \
  -t RestoApp-pwa-cliente \
  -t restoapp-pwa-cliente \
  -t restoapp/pwa-cliente:latest .
```

Levantar:

```bash
docker rm -f restoapp-pwa 2>/dev/null || true

docker run -d \
  --name restoapp-pwa \
  --restart unless-stopped \
  -p 8080:8080 \
  restoapp-pwa-cliente:latest
```

Verificar:

```bash
curl -I http://localhost:8080
```

## 8. Inicializar onboarding o seed inicial

```bash
cd ~/restoapp
API_URL=https://api.restoapp.pe/v1 npx tsx scripts/poblar-datos.ts
```

## Comandos de verificacion

Estado general:

```bash
cd ~/restoapp/infra
docker compose --env-file ../.env -f docker-compose.prod.yml ps
```

PWA:

```bash
docker ps | grep restoapp-pwa
curl -I http://localhost:8080
```

Backend por API Gateway:

```bash
curl -I https://api.restoapp.pe/v1/identidad/auth/me
```

## URLs finales

```text
App:
https://app.restoapp.pe

API:
https://api.restoapp.pe/v1

Grafana:
http://<IP_VPS>:3000

Jaeger:
http://<IP_VPS>:16686
```
