# Kong API Gateway de RestoApp

## ¿Por qué importa?

- **Un solo punto de entrada** para el frontend (`:8000`) en lugar de recordar 11 puertos.
- **CORS** centralizado para la PWA.
- Base para **JWT**, rate limiting y métricas sin tocar cada microservicio.

## Puertos de microservicios (host)

| Servicio       | PORT en `.env` | Ruta en Kong      |
| -------------- | -------------- | ----------------- |
| identidad      | 3001           | `/identidad`      |
| mesas          | 3002           | `/mesas`          |
| pedidos        | 3004           | `/pedidos`        |
| cuentas        | 3005           | `/cuentas`        |
| reservas       | 3006           | `/reservas`       |
| inventario     | 3007           | `/inventario`     |
| notificaciones | 3008           | `/notificaciones` |
| caja           | 3009           | `/caja`           |
| reportes       | 3010           | `/reportes`       |
| facturación    | 3011           | `/facturacion`    |
| compras        | 3012           | `/compras`        |

Kong reenvía `http://localhost:8000/pedidos/...` → `http://servicio-pedidos:3000/api/...`

## Levantar

```powershell
# Solo Kong (microservicios deben estar en nx serve con los PORT de la tabla)
docker compose -f infra/docker-compose.yml --profile dev up -d kong

# Infra completa (RabbitMQ, Postgres, Kong)
.\scripts\levantar-infra.ps1
```

- **Proxy:** http://localhost:8000
- **Admin API:** http://localhost:8001
- **Estado:** http://localhost:8001/status

## Probar

Usa el smoke autenticado documentado abajo para consultar los 11 servicios sin
exponer el token en argumentos o logs.

Si un microservicio no está levantado, Kong responde **502 Bad Gateway** (esperado).

## Subdominios tenant

Todas las rutas de Kong usan `preserve_host: true`. Los servicios reciben el
`Host` original y `@org/shared-auth` compara el slug de `*.restoapp.pe` o
`*.localhost` con el claim JWT firmado `tenantSlug`. El header `X-Tenant-Id`
del navegador no participa en esa decisión.

Los hosts base (`restoapp.pe`, `localhost` y los subdominios reservados
`app`, `api`, `admin`, `platform`, `superadmin`, `www`) se mantienen para login,
selector de tenant y compatibilidad local. En producción, un host desconocido
se rechaza. Dominios raíz adicionales se configuran en los servicios con
`TENANT_ROOT_DOMAINS`, separados por coma.

La carta pública puede consumir `TenantHostActual` para obtener la resolución
derivada del host antes del bypass de autenticación. El controlador debe
resolver ese slug contra `Tenant` o `TenantDomain`; no debe aceptar un tenantId
aportado por el navegador.

## Smoke de Kong

El smoke consulta `/health/ready` de los 11 servicios a través de Kong y solo
imprime servicio, código HTTP y latencia. No imprime tokens, cookies ni cuerpos
de respuesta.

```powershell
$env:SMOKE_AUTH_TOKEN = '<access token temporal>'
$env:SMOKE_TENANT_HOST = 'demo.localhost:8000' # opcional
node scripts/smoke-kong.mjs
```

Variables opcionales: `KONG_URL` (default `http://localhost:8000`),
`SMOKE_PROBE` (`ready` o `live`) y `SMOKE_TIMEOUT_MS`. El token se pasa solo por
entorno, nunca como argumento de línea de comandos.

## Editar rutas

Modifica `infra/kong/kong.yml.template`, reconstruye la imagen y reinicia Kong:

```powershell
docker compose -f infra/docker-compose.yml build kong
docker compose -f infra/docker-compose.yml restart kong
```

## Configuración de Cookies (SameSite)

Al desplegar en producción, la política de la cookie de sesión (`access_token`) y el token CSRF debe ajustarse a la topología del dominio:

- **Mismo dominio (Same-Site):** Si la PWA y Kong comparten `restoapp.pe`, configura la cookie con `SameSite=Strict` o `Lax`.
- **Dominio cruzado (Cross-Site):** Si la PWA y Kong usan sitios distintos, configura `SameSite=None` y `Secure=true`. Sin esto, el navegador no enviará la sesión.

*Asegúrese de modificar estas variables de entorno en el microservicio `servicio-identidad` según el entorno de despliegue real.*

## `jwt-cache` en modo degradado

El trade-off operativo de `degraded_mode` esta documentado en
`docs/operacion/jwt-cache-degraded.md`: los tokens cacheados pueden seguir
validos hasta su `exp` si identidad cae, incluso si fueron revocados durante esa
ventana.

## Desarrollo local: DNS tras recrear microservicios

Si `docker compose up --build` recrea varios servicios mientras Kong permanece activo, comprueba cada endpoint por nombre de servicio. En esta instalación se observó que Kong conservó direcciones de contenedores anteriores y entregó respuestas de otro microservicio hasta reiniciarlo. Después de un despliegue local de varios servicios, ejecuta `docker compose -f infra/docker-compose.yml --profile all restart kong` y verifica `/v1/{servicio}/health/ready` y las rutas modificadas. No cambies datos ni permisos para corregir este síntoma.
