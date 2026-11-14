# Corrección de usuarios del restaurante

La creación anterior guardaba Usuario sin Membresia ni MembresiaSede. Login
validaba la contraseña pero rechazaba la pertenencia al subdominio. La interfaz
solo permitía cambiar rol y estado, sin editar datos ni restablecer contraseña.

Ahora el alta es transaccional y el tenant procede del JWT autenticado. Listado,
edición, rol y estado se limitan al restaurante. La edición permite nombre, correo,
contraseña opcional, rol y sede. Restablecer contraseña elimina bloqueo temporal;
las modificaciones revocan refresh tokens (access tokens existentes expiran según
su TTL). No se permite editar cuentas de plataforma ni elevar roles del equipo.
Las cuentas compartidas entre restaurantes requieren gestión de plataforma.

La migración 20261114090000 solo repara cuentas sin ninguna membresía cuya sede
identifica un tenant. Conserva contraseña y estado, y registra cada reparación en
AuditoriaLog. No infiere dueño para cuentas sin sede ni reactiva membresías
deshabilitadas. La causa debe confirmarse en el VPS antes de dar por resuelto cada
caso; contraseñas incorrectas y cuentas bloqueadas tienen otras causas posibles.

## Aplicación en el VPS existente

El script construye dos imágenes desde el código actualizado, guarda dump completo
de identidad y CSV antes/después con permisos privados, luego recrea únicamente
identidad y PWA. Prisma aplica la migración al arrancar identidad. Hay una breve
interrupción de estos dos servicios. Caddy y los otros servicios no se recrean.
Docker debe tener espacio para las capas de compilación y el respaldo.

```bash
cd /opt/restoapp
git pull --ff-only origin main
bash scripts/vps/update-team-access.sh
```

El script imprime el directorio `backups/team-access-FECHA` con identidad.dump,
before.csv y after.csv. La consulta final cuenta las reparaciones auditadas por
tenant. No imprime contraseñas. Revisar errores de Prisma si falla el arranque:

```bash
cd /opt/restoapp/restoapp-vps-20261026
docker compose --env-file .env.vps -f docker-compose.yml -f docker-compose.caddy.yml -f docker-compose.users.yml logs --tail=100 servicio-identidad
```

Conservar `-f docker-compose.users.yml` en comandos futuros de Compose para usar
las imágenes corregidas. Ante fallo, conservar respaldos e inspeccionar logs antes
de repetir. No restaurar dumps ni borrar volúmenes sobre la instalación activa.

Verificar en navegador: recargar Usuarios; editar nombre y guardar sin contraseña;
restablecer contraseña si hace falta; entrar en ventana privada al subdominio del
restaurante con el empleado; comprobar su rol y sede. Si aún tiene un bloqueo
temporal previo, restablecer su contraseña desde Editar lo elimina.

## Validación

Pruebas de backend con bcrypt real: alta y login de empleado, rechazo de otro
subdominio, edición y nueva contraseña, conservación de contraseña omitida y
rechazo de roles privilegiados/sedes ajenas. Regresiones frontend: edición,
cancelación, contraseña omitida y conservación de formulario ante error.

La migración SQL pasó una evaluación aislada con PostgreSQL/WASM (PGlite): dos
tenants, usuarios activos/inactivos, membresía deshabilitada, cuenta asociada a
otro tenant, cuentas privilegiadas y sin sede; contraseñas conservadas y segunda
ejecución sin duplicados. Docker Desktop no estaba disponible en el equipo de
desarrollo; la reconstrucción y comprobación completa de contenedores se realizan
en el VPS mediante el script. La sintaxis Bash del script fue validada localmente.
