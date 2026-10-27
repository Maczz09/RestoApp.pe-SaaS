# RestoApp en restoapp.mavricitas.com

Actualización del VPS real: Ubuntu 24.04, IP 13.140.185.120, usa `agendly-caddy`
en 80/443. Para ese servidor seguir la [guía Caddy](DESPLIEGUE_VPS_CADDY.md), incluida en la release.
La sección Nginx de esta guía corresponde a instalaciones con Nginx en el host.

La plataforma usa `https://restoapp.mavricitas.com/platform`. Cada negocio usa
`https://<slug>.restoapp.mavricitas.com`. El sitio actual de `mavricitas.com`
mantiene su DNS y su bloque Nginx. No se necesita crear un registro DNS por tenant.

## 1. Preparar la release en el equipo de desarrollo

```powershell
node scripts/vps/release.mjs --domain restoapp.mavricitas.com --tag vps-20261026 --build --save
```

El directorio `artifacts/restoapp-vps-20261026` incluye `images.tar`, SHA256SUMS,
manifiesto de imágenes, Compose, plantilla de entorno, Nginx y operaciones. El
archivo contiene las 13 imágenes de aplicación y PostgreSQL/RabbitMQ para Linux
amd64. Para un VPS ARM recompilar con `--platform linux/arm64` y otro tag/directorio.
No subir `.env`, claves del equipo local ni los volúmenes Docker como imágenes.
Cada nueva release debe usar un tag nuevo. El manifiesto indica si se compiló
desde un árbol Git con cambios sin confirmar.

## 2. DNS en Cloudflare

Crear dentro de la zona `mavricitas.com`:

| Tipo | Nombre | Contenido | Proxy inicial |
| --- | --- | --- | --- |
| A | restoapp | IP pública del VPS | Solo DNS |
| A | *.restoapp | IP pública del VPS | Solo DNS |

No cambiar `@`, `www`, MX ni registros del sitio actual. Añadir AAAA solo si el
VPS tiene IPv6 configurado. Los tenants no crean nuevas entradas Cloudflare:
el wildcard resuelve la dirección y la aplicación valida el slug y su sesión.

Cloudflare Universal SSL de la zona principal no cubre por defecto este segundo
nivel (`negocio.restoapp.mavricitas.com`). Mantener Solo DNS hasta tener un
certificado edge que incluya `*.restoapp.mavricitas.com` si se desea activar el
proxy naranja. En ese caso usar Full (strict), y excluir login, `/v1/*`,
`/identidad/*` y conexiones Socket.IO de cualquier regla Cache Everything.

## 3. Transferir y cargar imágenes

Copiar el directorio completo de la release al VPS, por ejemplo `/opt/restoapp`.
Los siguientes comandos se ejecutan EN EL VPS. Requieren Docker Engine Linux,
Compose v2 y Nginx existentes. No ejecutar el Compose de desarrollo en producción.

```sh
cd /opt/restoapp
sha256sum -c SHA256SUMS
docker load -i images.tar
```

El Compose de esta release es autónomo, usa el proyecto `restoapp-vps` y nuevos
volúmenes identificados por ese nombre. No usa `container_name` fijo, no expone
bases/RabbitMQ, no instala Watchtower y publica solo `127.0.0.1:18000` para Nginx.
No ocupa 80/443/3000/8000 de otras aplicaciones. Para cambiar el puerto, cambiar
`GATEWAY_PORT` en `.env.vps` y el `proxy_pass` del archivo Nginx al mismo valor.

## 4. Configurar secretos e instalar sin demo

Para una instalación NUEVA, crear secretos en el propio VPS:

```sh
docker run --rm --entrypoint node -v "$PWD:/release" -w /release \
  restoapp/servicio-identidad:vps-20261026 ops/init-env.mjs \
  --domain restoapp.mavricitas.com --email TU_CORREO_REAL
chmod 600 .env.vps
docker compose --env-file .env.vps config --quiet
docker compose --env-file .env.vps up -d
docker compose --env-file .env.vps ps
```

El generador no sobrescribe `.env.vps`. Las contraseñas y RSA se generan al azar
y no se imprimen. Guardar ese archivo en un gestor seguro y respaldarlo fuera del
VPS: contiene también la clave de cifrado de credenciales fiscales.

Los servicios aplican SOLO las migraciones Prisma versionadas al arrancar. Esperar
a que los 11 servicios estén healthy antes del bootstrap (el arranque inicial
puede tardar por las migraciones). Si falla uno, revisar su log:

```sh
docker compose --env-file .env.vps logs --tail=100 servicio-identidad
```

Crear exclusivamente la cuenta global sin negocios, sedes ni usuarios demo:

```sh
docker compose --env-file .env.vps --profile ops run --rm -T bootstrap-admin
```

El bootstrap es idempotente: no cambia la clave de una cuenta existente y rechaza
promover una cuenta de restaurante a superadministrador. No ejecutar `seed-users.js`
en producción: ese seed también prepara datos demo.

## 5. HTTPS y Nginx del VPS

El certificado de `*.mavricitas.com` no cubre `*.restoapp.mavricitas.com`. Solicitar
un certificado con AMBOS nombres mediante DNS-01 de Cloudflare. Los siguientes
comandos con sudo son para el administrador del VPS:

```sh
sudo apt-get update
sudo apt-get install certbot python3-certbot-dns-cloudflare
sudo install -d -m 700 /root/.secrets/certbot
sudo nano /root/.secrets/certbot/cloudflare.ini
```

El archivo debe contener `dns_cloudflare_api_token = TOKEN_RESTRINGIDO_A_LA_ZONA`.
Crear el token Cloudflare con permisos DNS Edit y Zone Read solo sobre la zona
`mavricitas.com`. No usar la Global API Key ni guardar este token en Git/imagenes.

```sh
sudo chmod 600 /root/.secrets/certbot/cloudflare.ini
sudo certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/certbot/cloudflare.ini \
  --dns-cloudflare-propagation-seconds 60 \
  --cert-name restoapp.mavricitas.com \
  -d restoapp.mavricitas.com -d '*.restoapp.mavricitas.com' \
  --deploy-hook 'systemctl reload nginx'
sudo install -m 644 nginx/restoapp.conf /etc/nginx/sites-available/restoapp.conf
sudo ln -s /etc/nginx/sites-available/restoapp.conf /etc/nginx/sites-enabled/restoapp.conf
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --dry-run
```

Revisar que no exista ya un archivo/symlink `restoapp.conf` antes de instalarlo.
En sistemas sin sites-available, instalar dentro de `/etc/nginx/conf.d/` bajo el
contexto http. No reemplazar nginx.conf ni el virtual host del sitio principal.
Abrir 80/443 en el firewall existente; 18000 permanece en loopback. Nginx conserva
Host y Upgrade para API/Socket.IO. La PWA usa el mismo origen del negocio, por lo
que cookies Secure y HttpOnly permanecen aisladas por host.

## 6. Migrar una instalación con datos existentes

Antes de tocar datos, detener las escrituras en la instalación ORIGEN y sacar
`pg_dump -Fc` de cada una de sus 11 BDs y un archivo de comprobantes. No basta
copiar solo identidad: pedidos, caja, inventario y facturación son bases separadas.
Copiar también las claves originales, en especial FACTURACION_CRED_ENCRYPTION_KEY.
Restaurar dumps en bases VACÍAS antes de iniciar los servicios nuevos. Conservar
slugs/IDs de tenants y sedes. No hacer restauraciones encima de datos nuevos.

En la instalación origen, usar un backup compatible con el inventario de 11 BDs.
El sidecar incluido puede ejecutarse contra las BDs de esta release con:

```sh
docker compose --env-file .env.vps --profile backup run --rm backup
```

Después de restaurar, revisar los dominios sin modificar datos:

```sh
docker compose --env-file .env.vps exec -T servicio-identidad \
  node /usr/src/app/ops/migrate-domains.cjs \
  --from restoapp.pe --to restoapp.mavricitas.com
```

Cuando el reporte coincida con los tenants que se quieren migrar:

```sh
docker compose --env-file .env.vps exec -T servicio-identidad \
  node /usr/src/app/ops/migrate-domains.cjs \
  --from restoapp.pe --to restoapp.mavricitas.com --apply
```

El script guarda un snapshot previo en `/tmp/restoapp-domain-migration` dentro del
contenedor, valida conflictos y slugs reservados y aplica una transacción. Copiar
ese directorio fuera del contenedor con `docker cp`. Conserva los alias anteriores,
respeta un dominio propio principal, no toca ventas/usuarios y se puede repetir.
Con TENANT_ROOT_DOMAINS solo en el dominio nuevo, los alias antiguos quedan como
registro histórico. Mantenerlos accesibles exige configurar su DNS, HTTPS y
raíces admitidas en todos los servicios durante la transición. No cambiar slugs
para hacer la migración de dominio.

## 7. Verificación y actualizaciones

```sh
curl -I https://restoapp.mavricitas.com/login
curl --resolve restoapp.mavricitas.com:80:127.0.0.1 -I http://restoapp.mavricitas.com/login
docker compose --env-file .env.vps ps
```

Entrar con PLATFORM_ADMIN_EMAIL y PLATFORM_ADMIN_PASSWORD guardadas en `.env.vps`.
Crear un negocio de prueba desde `/platform/tenants/new`, abrir su subdominio y
entrar con su propietario. Comprobar primera sede, mesas, pedidos, cocina,
reservas, carta/QR, caja e inventario. Verificar que una sesión de un negocio
no accede al subdominio de otro y que los eventos se reciben solo en su tenant.
Los DNS wildcard permiten abrir un host inventado; el login debe rechazarlo si
no existe un tenant activo. La marca comercial RestoApp.pe permanece como marca.

Una actualización necesita backup, cargar una release con tag nuevo, conservar
`.env.vps` y volúmenes, `docker compose --env-file .env.vps up -d` y reiniciar Kong
para limpiar DNS de contenedores recreados. El rollback de imágenes no revierte
migraciones de BD: revisar compatibilidad antes de bajar de versión. No ejecutar
`docker compose down -v`. Programar backups y copiar tanto dumps/comprobantes como
las claves fuera del VPS. La herramienta de release prepara archivos localmente;
no cambia DNS ni instala en el VPS automáticamente.

Referencias: https://letsencrypt.org/docs/challenge-types/#dns-01-challenge,
https://certbot-dns-cloudflare.readthedocs.io/,
https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/limitations/.

## 8. Dependencias de esta release

Se fijaron `proxy-addr@2.0.8` y `dompurify@3.4.17` para corregir dos avisos
críticos del lock anterior. La auditoría del grafo de dependencias de ejecución
del 2026-10-26 registra 0 críticos, 25 altos y 15 moderados. Estos avisos pendientes
requieren revisión antes de abrir la instalación a clientes; no son una prueba
de explotación, ni esta release equivale a una certificación de seguridad.
`node-forge@1.4.0`, usado por Facturación al leer certificados PKCS#12, tiene un
aviso alto sin parche publicado: https://github.com/advisories/GHSA-86w9-cpqp-85rv.
El reporte `runtime-audit-summary.json` acompaña el paquete y no incluye secretos.
