# ============================================================
# NachoPps — Reconstrucción + Pruebas de Integración
# Uso: .\scripts\reconstruir-y-probar.ps1
# ============================================================
$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot\..

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  NachoPps — Reconstrucción Completa + Pruebas"
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Verificar que Docker funciona
Write-Host "`n[1/6] Verificando Docker..." -ForegroundColor Yellow
try {
    docker ps 2>&1 | Out-Null
} catch {
    Write-Host " ERROR: Docker no responde. Reinicia Docker Desktop." -ForegroundColor Red
    exit 1
}
Write-Host "   Docker OK" -ForegroundColor Green

# 2. Detener stack si está activo
Write-Host "`n[2/6] Deteniendo stack existente..." -ForegroundColor Yellow
docker compose -f infra/docker-compose.yml --profile all down 2>&1 | Out-Null
Write-Host "   Stack detenido" -ForegroundColor Green

# 3. Remover imágenes viejas (cache de build)
Write-Host "`n[3/6] Limpiando imágenes previas..." -ForegroundColor Yellow
docker image rm infra-servicio-identidad 2>&1 | Out-Null
docker image rm infra-servicio-mesas    2>&1 | Out-Null
docker image rm infra-servicio-pedidos  2>&1 | Out-Null
docker image rm infra-servicio-cuentas  2>&1 | Out-Null
docker image rm infra-servicio-reservas 2>&1 | Out-Null
docker image rm infra-servicio-inventario 2>&1 | Out-Null
docker image rm infra-servicio-notificaciones 2>&1 | Out-Null
docker image rm infra-servicio-caja     2>&1 | Out-Null
docker image rm infra-servicio-reportes 2>&1 | Out-Null
docker image rm infra-kong              2>&1 | Out-Null
docker image rm infra-pwa-cliente       2>&1 | Out-Null
Write-Host "   Imágenes limpiadas" -ForegroundColor Green

# 4. Reconstruir todas las imágenes (entrypoint fix ya aplicado en entrypoint.sh)
Write-Host "`n[4/6] Reconstruyendo imágenes Docker (esto puede tomar varios minutos)..." -ForegroundColor Yellow

$services = @(
    "servicio-identidad",
    "servicio-mesas",
    "servicio-pedidos",
    "servicio-cuentas",
    "servicio-reservas",
    "servicio-inventario",
    "servicio-notificaciones",
    "servicio-caja",
    "servicio-reportes",
    "servicio-facturacion",
    "servicio-compras"
)

foreach ($svc in $services) {
    Write-Host "  Construyendo restoapp-$svc..." -NoNewline
    $buildOutput = docker build --build-arg APP_NAME=$svc -t "RestoApp-$svc" -t "restoapp-$svc" -t "infra-$svc" -f Dockerfile . 2>&1
    $exitCode = $LASTEXITCODE
    if ($exitCode -eq 0) {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " FAIL" -ForegroundColor Red
        Write-Host $buildOutput -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n   Construyendo Kong..." -NoNewline
$buildOutput = docker compose -f infra/docker-compose.yml --profile all build kong 2>&1
$exitCode = $LASTEXITCODE
if ($exitCode -eq 0) {
    Write-Host " OK" -ForegroundColor Green
} else {
    Write-Host " FAIL" -ForegroundColor Red
    Write-Host $buildOutput -ForegroundColor Red
    exit 1
}

Write-Host "`n   Construyendo PWA cliente..." -NoNewline
$buildOutput = docker build -t "RestoApp-pwa-cliente" -t restoapp-pwa-cliente -t infra-pwa-cliente -f apps/pwa-cliente/Dockerfile . 2>&1

$exitCode = $LASTEXITCODE
if ($exitCode -eq 0) {
    Write-Host " OK" -ForegroundColor Green
} else {
    Write-Host " FAIL" -ForegroundColor Red
    Write-Host $buildOutput -ForegroundColor Red
    exit 1
}

# 5. Levantar stack
Write-Host "`n[5/6] Levantando stack..." -ForegroundColor Yellow
$upOutput = docker compose -f infra/docker-compose.yml --profile all up -d --wait --wait-timeout 120 2>&1
$upExit = $LASTEXITCODE
$upOutput | Where-Object { $_ -match "Error|error|failed|FAIL" } | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
if ($upExit -ne 0) {
    Write-Host "   ADVERTENCIA: docker compose up retornó $upExit — verificando contenedores..." -ForegroundColor Yellow
    docker compose -f infra/docker-compose.yml --profile all ps 2>&1
}
Write-Host "   Stack levantado (exit: $upExit)" -ForegroundColor Green

# Aplicar schemas de Prisma desde el host (más rápido que dentro de contenedores)
Write-Host "`n   Esperando 15 segundos a que las bases de datos Postgres estén listas para recibir conexiones..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

Write-Host "`n   Aplicando schemas de Prisma..." -ForegroundColor Yellow

$dbPorts = @{
    "servicio-identidad" = "5439"
    "servicio-mesas" = "5433"
    "servicio-pedidos" = "5434"
    "servicio-cuentas" = "5435"
    "servicio-reservas" = "5441"
    "servicio-inventario" = "5436"
    "servicio-notificaciones" = "5440"
    "servicio-caja" = "5437"
    "servicio-reportes" = "5438"
}

foreach ($svc in $services) {
    $port = $dbPorts[$svc]
    $dbName = "$svc-db"
    $dbName = $dbName -replace "servicio-", ""
    Write-Host "    $svc..." -NoNewline
    $env:DATABASE_URL = "postgresql://nachopps:secret@localhost:$port/$($dbName)_db?schema=public"
    Push-Location apps/$svc
    npx prisma db push --accept-data-loss 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host " OK" -ForegroundColor Green }
    else { Write-Host " FAIL" -ForegroundColor Red }
    Pop-Location
}

# Seed del usuario admin
Write-Host "`n   Sembrando usuario admin..." -ForegroundColor Yellow
$env:DATABASE_URL = "postgresql://nachopps:secret@localhost:5439/identidad_db?schema=public"
Push-Location apps/servicio-identidad
node "..\..\scripts\seed-admin.js" 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "   Seed admin falló" -ForegroundColor Red }
Pop-Location
Write-Host "   Seed completado" -ForegroundColor Green

# 6. Ejecutar población + pruebas
Write-Host "`n[6/6] Ejecutando población y pruebas..." -ForegroundColor Yellow

Write-Host "`n   >>> POBLACIÓN <<<" -ForegroundColor Cyan
npx tsx scripts/poblar-datos.ts
if ($LASTEXITCODE -ne 0) { Write-Host "Población falló" -ForegroundColor Red; exit 1 }

Write-Host "`n   >>> PRUEBAS DE INTEGRACIÓN <<<" -ForegroundColor Cyan
npx tsx scripts/pruebas-integracion.ts

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  Proceso completado. Informe: docs/informe-pruebas.md"
Write-Host "============================================================" -ForegroundColor Cyan
