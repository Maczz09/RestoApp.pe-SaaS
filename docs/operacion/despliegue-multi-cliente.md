# Despliegue multi-cliente: repo core + réplicas por cliente

Este documento explica el plan de despliegue para el modelo elegido: **un
repo "core" de desarrollo** (este, `sistema-para-restaurantes`) y **una
réplica independiente por cliente**, cada una con su propio repo de GitHub
y su propio VPS de producción.

Escrito 2026-08-10. Estado: **la parte de "réplicas" (fork + repo) ya está
hecha. La parte de CI/CD → VPS todavía NO está armada** — este documento es
el plan, no una automatización ya funcionando.

## 1. El modelo mental

```
sistema-para-restaurantes (GitHub)     ← "core": donde vive el desarrollo
        │  origin de D:\Restaurantes\App Base\sistema
        │
        │  git clone (con toda la historia)
        ├──────────────┬──────────────────────┐
        ▼              ▼                      ▼
   mi-narcita     la-barra-del-ceviche      (futuro cliente 3...)
   (GitHub)             (GitHub)
        │                    │
        │ CI/CD (push a main)│ CI/CD (push a main)
        ▼                    ▼
   VPS cliente 1        VPS cliente 2
   (producción)         (producción)
```

- **Local, en esta PC**: 3 carpetas independientes en `D:\Restaurantes\`:
  - `App Base\sistema` → el core, apunta a `sistema-para-restaurantes`.
  - `mi-narcita` → réplica completa (historia incluida), apunta a
    `github.com/Maczz09/mi-narcita`.
  - `la-barra-del-ceviche` → réplica completa, apunta a
    `github.com/Maczz09/la-barra-del-ceviche`.
- Cada carpeta de cliente tiene **dos remotos**:
  - `origin` → su propio repo (`mi-narcita` o `la-barra-del-ceviche`). Ahí
    se hace `push` para producción de ESE cliente.
  - `upstream` → `sistema-para-restaurantes` (el core). Sirve para traer
    mejoras del core hacia el cliente más adelante (`git fetch upstream`
    + `git merge upstream/main`), sin tener que copiar archivos a mano.

Por qué así y no un monorepo con "modo cliente" por variable de entorno:
cada cliente puede terminar necesitando cambios de código propios (no solo
de configuración) — un logo distinto, una regla de negocio distinta, un
plan de precios distinto. Con repos separados, esos cambios no contaminan
el core ni a los otros clientes, y cada uno puede evolucionar a su ritmo.
El costo es que hay que traer mejoras del core a mano (merge de
`upstream`), en vez de que aparezcan solas.

## 2. Qué significa "producción" en este modelo

Cada cliente = **un VPS propio**, corriendo su propia copia completa de la
stack (Kong, los 11 microservicios, sus bases de datos, RabbitMQ, la PWA).
No hay multi-tenancy a nivel de infraestructura (no comparten base de
datos ni contenedores entre clientes) — cada VPS es una instalación
independiente del mismo software.

Esto es coherente con el trabajo de esta sesión: la marca ("RestoApp.pe")
y la ubicación de la sede ya se centralizaron en un par de archivos
(`libs/observabilidad/src/lib/brand.ts` y
`apps/pwa-cliente/src/config.ts`) precisamente para que cambiarle el
nombre a cada cliente sea editar 2 archivos, no buscar-y-reemplazar en todo
el código.

## 3. Lo que YA existe en el repo (heredado por las 2 réplicas)

`.github/workflows/deploy.yml` ya compila y sube a GitHub Container
Registry (`ghcr.io`) las imágenes Docker de los 11 servicios + la PWA +
Kong, en cada push a `main`. Eso es la mitad del trabajo — la parte de
**build**. Lo que falta es la mitad de **deploy**: nada baja esas imágenes
nuevas al VPS todavía. Hoy, si haces push a `main`, las imágenes quedan
listas en GHCR pero el VPS sigue corriendo las viejas hasta que alguien
entre por SSH y haga `docker compose pull && docker compose up -d` a mano.

Dos cosas a ajustar en `deploy.yml` quedaron heredadas del repo core y
**hay que revisarlas antes de usarlo en un repo de cliente**:

1. `REGISTRY_NAME: ghcr.io/${{ github.repository_owner }}/nachoppssoa` está
   fijo a `nachoppssoa` sin importar en qué repo corra. Si `mi-narcita` y
   `la-barra-del-ceviche` usan este mismo workflow tal cual, **las imágenes
   de ambos clientes se pisarían entre sí** en el mismo namespace de GHCR.
   Cambiarlo a algo derivado del nombre del repo, p. ej.
   `ghcr.io/${{ github.repository_owner }}/${{ github.event.repository.name }}`.
2. El build-arg de `pwa-cliente` trae hardcodeado
   `VITE_API_BASE_URL=https://nachopps-app.duckdns.org` — cada cliente
   necesita su propio dominio ahí.

## 4. Lo que falta armar (la parte "deploy" real)

Cuando retomemos esto, hay tres formas estándar de resolver "el VPS se
entera de que hay imagen nueva y se actualiza solo". De más simple a más
robusta:

**Opción A — SSH desde el workflow (la más directa).**
Un job nuevo en `deploy.yml`, después de `build-and-push`, que se conecta
por SSH al VPS (con `appleboy/ssh-action` o similar) y corre
`docker compose pull && docker compose up -d --remove-orphans`. Necesita
guardar como *secrets* de GitHub en cada repo de cliente: `VPS_HOST`,
`VPS_USER`, `VPS_SSH_KEY` (clave privada dedicada, no la personal), y el
VPS necesita tener un token de lectura a GHCR ya logueado
(`docker login ghcr.io`) para poder hacer `pull` de un paquete que
probablemente sea privado.

**Opción B — Watchtower en el VPS.**
Un contenedor (`containrrr/watchtower`) corriendo en el VPS que revisa
GHCR cada cierto tiempo y redespliega solo si hay imagen `:latest` nueva.
Más simple de operar (nada que tocar en GitHub Actions), pero menos
predecible (el despliegue no queda atado al momento exacto del push) y
sin visibilidad de "qué se desplegó y cuándo" salvo mirando logs del VPS.

**Opción C — Webhook.**
El workflow, al terminar de subir las imágenes, llama a un endpoint HTTP
en el VPS (un pequeño servicio o un webhook de un runner tipo
`webhookrelay`/`portainer` con auto-deploy) que dispara el pull+restart.
Más trabajo de infraestructura por adelantado, mejor para cuando haya
varios servicios que actualizar de forma coordinada o se quiera un paso de
healthcheck antes de cortar tráfico.

**Recomendación:** empezar con la Opción A. Es la que da más control y
visibilidad (el log del deploy vive en la pestaña Actions de GitHub, junto
al build), y es la que más se parece a lo que ya hay armado
(`infra/docker-compose.prod.yml` y `infra/docker-compose.secrets.yml` ya
existen en el repo — son justo lo que un `docker compose pull && up -d`
en el VPS usaría).

## 5. Secretos y configuración por cliente

Cada VPS va a necesitar sus propios valores para lo que hoy vive en
`.env`/`infra/docker-compose.secrets.yml` en local: contraseñas de las 9
bases de datos, `JWT` privado/público, `SERVICE_JWT_SECRET`, credenciales
de RabbitMQ, y si aplica, credenciales de facturación electrónica (SUNAT)
propias de cada restaurante — esas NO se comparten entre clientes ni se
suben al repo. Van como GitHub *secrets* del repo de cada cliente (para
que el workflow los inyecte en el deploy) o directamente como archivo
`.env` en el VPS, fuera de git.

## 6. Traer mejoras del core a un cliente ya desplegado

Con el remoto `upstream` ya configurado en `mi-narcita` y
`la-barra-del-ceviche`:

```bash
git fetch upstream
git merge upstream/main
# resolver conflictos si los hay (lo más probable: brand.ts y config.ts,
# porque cada cliente ya tiene su propio nombre/ubicación ahí)
git push origin main   # dispara el CI/CD de ESE cliente
```

## 7. Próximos pasos concretos (cuando retomemos)

1. Decidir Opción A/B/C (recomendado: A).
2. Ajustar `REGISTRY_NAME` y el build-arg de `pwa-cliente` en el
   `deploy.yml` de cada repo de cliente para que no choquen entre sí.
3. Levantar el VPS de al menos un cliente con `infra/docker-compose.prod.yml`
   una vez a mano, para confirmar que corre, antes de automatizar nada.
4. Agregar el job de deploy por SSH a `deploy.yml` en ese cliente y probar
   un push a `main` de punta a punta.
5. Repetir para el segundo cliente.
