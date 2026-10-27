# Validación local de la migración a mavricitas.com

Destino preparado: `restoapp.mavricitas.com` y `<slug>.restoapp.mavricitas.com`.
Imágenes: `vps-20261026`, Linux AMD64. La validación usó el proyecto Docker
independiente `restoapp-vps-qa-20261026`, con bases nuevas y credenciales aleatorias.
No se aplicaron cambios DNS, certificados públicos ni datos del VPS.

| Comprobación | Resultado |
| --- | --- |
| Shared auth, CORS y hosts anidados | 133 pruebas aprobadas |
| Identidad | 113 pruebas aprobadas |
| Notificaciones | 53 pruebas aprobadas |
| Frontend de dominios | 7 pruebas aprobadas, typecheck y build correctos |
| Inventario Compose y planificación de migración | 7 pruebas aprobadas |
| Compilación Docker | 13 imágenes construidas |
| Compose VPS | Configuración válida; solo gateway publicado en loopback |
| Nginx | `nginx -t` correcto con certificados de prueba |
| Instalación vacía | 11 servicios, 11 bases, RabbitMQ, PWA y Kong saludables |
| Bootstrap de superadmin | Crea cuenta sin tenant; repetición conserva contraseña |
| Evaluación HTTP y WebSocket | 23 comprobaciones aprobadas |
| Migración PostgreSQL de dominios | Simulación sin escrituras, alias conservados, principal nuevo, dominio propio preservado, repetición idempotente |
| Backup | 11 dumps PostgreSQL y archivo de comprobantes correctos |
| Archivo de imágenes | SHA256 verificado e importación `docker load` correcta |

La evaluación HTTP comprueba cookies Secure/HttpOnly sin atributo Domain, alta de
dos negocios sin sede, sus logins en hosts anidados, disponibilidad de los once
servicios, rechazo del cruce de sesiones entre tenants y rechazo de la sesión
global en hosts de negocios. WebSocket acepta el host firmado y rechaza el cruce.

Los scripts reproducibles son `scripts/vps-smoke.eval.mjs` y
`scripts/vps-domain-migration.eval.mjs`. Exigen un proyecto con prefijo de QA
antes de crear fixtures. Los reportes JSON se incluyen en la release. Los datos
de prueba y sus snapshots permanecen en el proyecto QA, nunca en las imágenes.

El archivo `images.tar` incluye las 13 imágenes de aplicación más PostgreSQL y
RabbitMQ. `manifest.json` guarda los IDs de imagen, plataforma y revisión base;
`dirtySource=true` indica que se construyó desde los cambios locales de esta
migración, no desde un commit publicado. No se publicaron imágenes en un registry.

Pendiente antes de servir clientes: revisar los 25 avisos altos y 15 moderados
que permanecen en dependencias de ejecución. Los dos avisos críticos originales
se corrigieron y se comprobaron sus versiones dentro de la imagen final.
La instalación del VPS necesita aplicar los registros Cloudflare, obtener el
certificado wildcard DNS-01 y habilitar el virtual host Nginx según la guía.
