# RestoApp junto a Agendly con Caddy

El VPS Ubuntu 24.04, x86_64, IP 13.140.185.120, ya publica Agendly usando el
contenedor `agendly-caddy` en 80/443. Docker y Compose están instalados. Esta
integración añade un virtual host al proxy existente. Las imágenes RestoApp
`vps-20261026` ya construidas siguen siendo válidas.

Inspección confirmada del servidor:

- Imagen actual: `agendly-caddy`, con módulo `dns.providers.cloudflare` instalado.
- Red existente: `agendly_default`.
- Caddyfile del host: `/opt/agendly/agendly-citas-backend/deploy/Caddyfile`,
  montado como `/etc/caddy/Caddyfile`.
- Volúmenes persistentes de Caddy: `agendly_caddy_config` en `/config` y
  `agendly_caddy_data` en `/data`.

Para este servidor usar `CADDY_NETWORK=agendly_default` en `.env.vps` y la plantilla
`caddy/restoapp.cloudflare.caddyfile`. Antes de agregar el sitio, comprobar qué
variable de entorno de Cloudflare utiliza el Caddyfile actual, sin imprimir su
valor. Si su nombre difiere de `CLOUDFLARE_API_TOKEN`, adaptar el placeholder al
nombre existente. Respaldar el Caddyfile en su ruta real y validar la configuración
antes de recargar Caddy. Estas instrucciones aún no se han aplicado al VPS.

## Inspección previa de solo lectura en el VPS

```sh
docker inspect agendly-caddy --format '{{.Config.Image}}'
docker inspect agendly-caddy --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
docker inspect agendly-caddy --format '{{range $name, $network := .NetworkSettings.Networks}}{{println $name}}{{end}}'
docker exec agendly-caddy caddy list-modules | grep dns.providers
```

Las rutas y la red obtenidas determinan el archivo que se respaldará y editará.
Si la última consulta no imprime nada, el Caddy instalado no anuncia un proveedor
DNS. No pegar tokens de Cloudflare ni archivos `.env` en el chat.

## Conexión entre los dos proyectos Docker

Añadir `CADDY_NETWORK=NOMBRE_REAL_DE_LA_RED` al archivo `.env.vps` de RestoApp.
El nombre debe ser una red a la que YA pertenezca `agendly-caddy`. La configuración
adicional solo conecta Kong a esa red y conserva la red privada de RestoApp:

```sh
docker compose --env-file .env.vps -f docker-compose.yml -f docker-compose.caddy.yml config --quiet
docker compose --env-file .env.vps -f docker-compose.yml -f docker-compose.caddy.yml up -d
```

Mantener ambos `-f` en futuras actualizaciones. Bases, servicios y RabbitMQ no
se conectan a la red de Agendly. El alias del gateway es `restoapp-gateway`.
Desde Caddy se usa `restoapp-gateway:8000`: `127.0.0.1` dentro del contenedor
designaría al propio Caddy, no al puerto loopback del host.

## TLS y nuevo virtual host

Elegir el bloque según la inspección y agregarlo a la configuración EXISTENTE,
conservando sus sitios y opciones globales. Respaldar primero el Caddyfile y el
Compose de Agendly. No reemplazar el archivo completo con la plantilla.

- `caddy/restoapp.cloudflare.caddyfile`: requiere que el Caddy actual incluya
  `dns.providers.cloudflare` y que reciba `CLOUDFLARE_API_TOKEN` como secreto del
  VPS. Caddy podrá emitir y renovar el wildcard con DNS-01. No guardar el token
  en el Caddyfile, imágenes ni Git.
- `caddy/restoapp.files.caddyfile`: funciona con el módulo TLS estándar, usando
  un certificado para `restoapp.mavricitas.com` y `*.restoapp.mavricitas.com` emitido
  con Certbot/Cloudflare DNS-01. El contenedor debe poder leer el par PEM en
  `/etc/caddy/restoapp-tls/`. La renovación debe actualizar los archivos y recargar
  Caddy. Los mounts reales se definirán tras inspeccionar el contenedor.

Si hace falta cambiar mounts o imagen de Caddy, revisar su Compose original y
programar la recreación mínima. Una recarga de configuración existente utiliza
`caddy reload`, después de `caddy validate`; rutas y forma de carga dependen del
contenedor actual. No adivinar el Caddyfile ni recrear Agendly con un Compose nuevo.
El wildcard requiere DNS-01 para emisión automática; activar el proxy naranja
de Cloudflare requiere además cobertura TLS edge de ese nivel.

La instalación de los servicios RestoApp, secretos y primer superadmin sigue la
guía README hasta la sección 4. Para el proxy de este VPS, usar ESTA integración
en lugar de la sección Nginx. Los cambios de producción se aplicarán cuando se
hayan revisado la red, configuración y certificado del Caddy existente.

Referencias: https://caddyserver.com/docs/caddyfile/patterns#reverse-proxy y
https://caddyserver.com/docs/caddyfile/directives/tls.
