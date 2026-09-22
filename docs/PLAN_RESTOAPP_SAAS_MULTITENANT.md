# Plan de implementación: RestoApp.pe web SaaS multitenant

Estado: plan aprobado pendiente de ejecución.

Este documento define cómo convertir el sistema actual en la base limpia de RestoApp.pe, conservar la cobertura funcional de Restaurante Mi Narcita y operar una sola plataforma web para múltiples restaurantes con aislamiento estricto de datos.

## 1. Decisión recomendada

La base de trabajo debe ser `D:\Restaurantes\App Base\sistema`.

Motivos:

- Ya contiene la marca central `RestoApp.pe` en la configuración de frontend y observabilidad.
- Ya tiene los 11 dominios operativos: identidad, mesas, pedidos, cuentas, reservas, inventario, notificaciones, caja, reportes, facturación y compras.
- Ya incluye soporte multisede, compras reales y el flujo web React/Vite.
- Es el repositorio core conectado a `sistema-para-restaurantes`.

Las otras carpetas se usarán como donantes de funciones y evidencia:

- `D:\Restaurantes\mi-narcita`: fuente funcional para recuperar todo lo que todavía no está en App Base.
- `D:\Restaurantes\la-barra-del-ceviche`: fuente prioritaria para incorporar las mejoras más recientes que todavía no llegaron al core ni a Mi Narcita.
- `D:\Restaurantes\La barra del ceviche\sistema`: no debe copiarse sobre App Base. La ruta exacta indicada contiene `factuez-grifo-san-jose`, una solución de facturación para grifo basada en Turbo/pnpm, no el sistema restaurantero Nx.

Antes de ejecutar cambios se debe confirmar esta interpretación de las dos carpetas casi homónimas.

## 2. Estado observado

### 2.1 Arquitectura actual

- Monorepo Nx.
- React 19, Vite y React Router para la PWA.
- NestJS y Prisma en 11 servicios.
- PostgreSQL con base por servicio.
- RabbitMQ para eventos, Kong como gateway y WebSocket para actualizaciones en vivo.
- JWT RS256 para usuarios y HS256 para comunicación entre servicios.
- Outbox transaccional, idempotencia, métricas, trazas y pruebas de resiliencia.

### 2.2 No existe multitenancy SaaS todavía

El documento actual `docs/operacion/despliegue-multi-cliente.md` define un repositorio, un VPS y una pila completa por cliente. Expresamente indica que no existe multitenancy de infraestructura ni de datos.

El modelo actual solo separa sedes:

- El JWT contiene `sedeId`, pero no `tenantId`.
- `Usuario` pertenece como máximo a una sede.
- `Sede.nombre` y `Usuario.email` son únicos globales.
- Los servicios filtran por `sedeId` de forma desigual.
- Notificaciones, eventos, idempotencia, archivos y caché no tienen un límite de tenant común.

Una sede no equivale a un tenant. Un tenant representa al restaurante o grupo empresarial; el tenant puede contener varias sedes.

### 2.3 Limpieza de marca pendiente

Aunque la UI ya usa parcialmente `RestoApp.pe`, el árbol conserva referencias de clientes y nombres técnicos históricos en código, fixtures, infraestructura, documentación, dominios, nombres de contenedores, volúmenes, credenciales de desarrollo, exchange AMQP, Postman y pruebas.

También existen marcadores de logo con una letra en el login y sidebar. La carpeta pública solo tiene un favicon y todavía no integra los cinco archivos de marca entregados.

### 2.4 Funciones de Mi Narcita ausentes o incompletas en App Base

El inventario de archivos detectó funciones que deben portarse y adaptarse, no copiarse en bloque:

- Carta pública por QR y actualizaciones en vivo.
- Configuración de empresa para facturación.
- Credenciales SUNAT cifradas.
- Notas de crédito y débito.
- Impresión de comprobante y cierre Z.
- Auditoría de anulaciones de pedidos, ítems y atenciones de mesa.
- Edición completa de usuarios.
- Inventario de almacén y cocina.
- Categorías de insumos, movimientos y kardex.
- Conteo físico, edición de producto y exportación de inventario.
- CRUD completo de mermas.
- Correlativos de cuenta, caja, reservas, pedidos y mermas.
- Reconciliación entre cuenta y mesa.
- Estadísticas y top de ventas.
- Teléfono de usuario y sede.

App Base tiene cambios propios que se deben conservar, entre ellos compras reales, selector de sedes, historial de mermas, PDF de comprobante y mejoras recientes de caja.

### 2.5 Mejoras nuevas de La Barra que deben entrar a RestoApp SaaS

La comparación de los tres árboles detectó cambios exclusivos en `D:\Restaurantes\la-barra-del-ceviche`. Se incorporarán al producto SaaS según esta clasificación.

Portar directamente y adaptar a tenant:

- Tamaños y variantes de plato en inventario, carta, comandero y carta pública.
- Soporte de dos RUC o empresas fiscales por sede.
- Alertas sonoras operativas para cocina y tableros.
- Vista y flujo específico de impresión de cocina.
- Navegación segura hacia vistas de impresión.
- Pruebas adicionales de autenticación, toasts, carta pública y WebSocket.
- Evaluación automatizada de agrupación de productos por tamaño.

Convertir a equivalentes SaaS web:

- La configuración inicial local se convierte en onboarding de tenant y primera sede.
- La cola de impresión local se convierte en un servicio o agente de impresión asociado al tenant y sede, con fallback de impresión del navegador.
- El gestor local de backups se convierte en backups administrados, restauración por tenant y pruebas de recuperación.
- La supervisión de procesos locales se convierte en health checks, readiness y reinicio de contenedores.
- La mensajería JetStream local se sustituye por la mensajería central ya elegida para la plataforma.
- La información de servidor local se sustituye por estado de servicios y conectividad de la sede.

No portar al producto web:

- Aplicación de escritorio Tauri.
- PostgreSQL, NATS o microservicios embebidos en un instalador Windows.
- Descubrimiento por IP local y reserva DHCP.
- Iconos, logos, nombres, seeds y recursos visuales del restaurante donante.
- Scripts que empaquetan una pila completa por cliente.

La funcionalidad útil de esos componentes no se pierde. Se transforma en una capacidad compatible con la arquitectura SaaS.

## 3. Alcance funcional del producto SaaS

La versión objetivo debe incluir:

1. Operación de salón: sedes, ubicaciones, mesas y reservas.
2. Pedidos: comandero, cocina, estados, anulaciones y auditoría.
3. Caja: turnos, pagos, cuentas, historial, arqueo, cierre y tickets.
4. Carta: categorías, productos, tamaños, menú diario y carta pública QR.
5. Inventario: productos, insumos, almacén, cocina, kardex, conteo, mermas y exportación.
6. Compras: proveedores, insumos, órdenes, recepción y comprobantes adjuntos.
7. Facturación electrónica: empresas, series, correlativos, SUNAT, comprobantes y notas.
8. Reportes: ventas, productos, meseros, periodos y exportaciones.
9. Administración: usuarios, roles, permisos, sedes y auditoría.
10. SaaS: tenants, membresías, onboarding, planes, límites, estado de cuenta y administración de plataforma.
11. Variantes de producto: tamaños de plato, precios y disponibilidad por sede.
12. Operación asistida: alertas sonoras y cola de impresión de cocina por sede.
13. Configuración fiscal: más de una empresa o RUC por sede cuando el plan lo permita.

No se traerán datos, secretos, certificados, logos, dominios ni configuración de despliegue de los restaurantes donantes.

## 4. Modelo multitenant objetivo

### 4.1 Estrategia de aislamiento

Para la primera versión SaaS se recomienda una base compartida por servicio con una columna `tenantId` obligatoria en todas las tablas de negocio.

La separación tendrá tres capas:

1. Autorización de aplicación: cada solicitud recibe un contexto de tenant validado desde la sesión.
2. Filtro obligatorio en repositorios y servicios: todas las lecturas y escrituras incluyen `tenantId`.
3. PostgreSQL Row Level Security: política de denegación por defecto para evitar que un error de consulta exponga filas de otro tenant.

PostgreSQL aplica denegación por defecto cuando RLS está habilitado y no existe una política aplicable. El usuario de la aplicación no debe ser propietario de tablas, superusuario ni tener `BYPASSRLS`. Las migraciones usarán un rol distinto.

Fuentes técnicas:

- PostgreSQL Row Security: https://www.postgresql.org/docs/17/ddl-rowsecurity.html
- OWASP Authorization: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- OWASP Business Logic Security: https://cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Security_Cheat_Sheet.html

### 4.2 Identidad y membresías

El servicio de identidad incorporará:

- `Tenant`: restaurante o grupo empresarial.
- `TenantDomain`: slug y futuros dominios personalizados.
- `Usuario`: identidad global con email único.
- `Membresia`: relación usuario-tenant con rol, estado y permisos.
- `MembresiaSede`: sedes a las que puede acceder una membresía.
- `Sede`: siempre pertenece a un tenant.
- `Plan` y `Entitlement`: módulos y límites habilitados.
- `AuditLog`: tenant, actor, acción, recurso, resultado, IP y correlación.

Esto permite que una misma persona acceda a más de un restaurante sin duplicar su identidad.

### 4.3 Sesión y selección de tenant

Flujo recomendado:

1. El usuario inicia sesión con su identidad global.
2. Si tiene una sola membresía activa, se selecciona automáticamente.
3. Si tiene varias, elige el restaurante.
4. El backend emite un access token limitado a un tenant.
5. El usuario elige una sede permitida dentro de ese tenant.

El access token incluirá como mínimo:

- `sub`
- `tenantId`
- `membershipId`
- `role`
- `permissions`
- `allowedSedeIds`
- `activeSedeId`
- `sessionVersion`

El backend no aceptará un `tenantId` enviado libremente en body, query o header. Solo una operación de plataforma, protegida por un rol separado, podrá actuar sobre otro tenant.

### 4.4 Cambios obligatorios en cada servicio

Cada esquema Prisma debe incorporar `tenantId` en:

- Agregados principales.
- Proyecciones locales.
- Outbox e inbox.
- Claves de idempotencia.
- Auditorías.
- Secuencias y correlativos.
- Notificaciones.

Las restricciones globales se vuelven compuestas. Ejemplos:

- `Sede`: `@@unique([tenantId, nombre])`
- `Mesa`: `@@unique([tenantId, sedeId, numero])`
- `Proveedor`: `@@unique([tenantId, sedeId, ruc])`
- `IdempotencyKey`: `@@unique([tenantId, key])`
- Series fiscales: únicas dentro de empresa y tenant.

Las tablas hijas también deben guardar `tenantId` de forma explícita cuando necesiten RLS, búsquedas directas o consumo asíncrono.

### 4.5 Contexto de base de datos

Cada operación de negocio se ejecutará en una transacción que:

1. Obtiene `tenantId` del contexto autenticado.
2. Ejecuta `SET LOCAL app.tenant_id = ...`.
3. Realiza las consultas Prisma dentro de la misma transacción.
4. Limpia el contexto automáticamente al cerrar la transacción.

Se creará una biblioteca compartida para que los servicios no implementen este patrón de forma distinta.

### 4.6 Eventos y tiempo real

El envelope de eventos tendrá una versión nueva con:

- `eventId`
- `eventType`
- `schemaVersion`
- `tenantId`
- `sedeId`
- `actorId`
- `correlationId`
- `causationId`
- `occurredAt`
- `payload`

Reglas:

- Un consumidor rechaza eventos sin tenant en la versión nueva.
- La deduplicación usa tenant más eventId.
- Las proyecciones verifican tenant en cada referencia cruzada.
- Las salas WebSocket se nombran por tenant y sede.
- No se crea una cola RabbitMQ por tenant.

El exchange técnico heredado se migrará a un nombre neutral de RestoApp. Si existieran instalaciones activas, se usará una ventana temporal de doble publicación y doble binding. Para una base limpia se hará un corte directo.

### 4.7 Archivos, caché y modo offline

- Los comprobantes de compra pasarán a almacenamiento S3 compatible.
- La clave del objeto será `tenantId/sedeId/tipo/fecha/id`.
- Las URLs serán firmadas y de corta duración.
- React Query, IndexedDB, Service Worker y cualquier persistencia local incluirán tenant y usuario en sus claves.
- Al cambiar de tenant o cerrar sesión se purgarán datos locales del contexto anterior.
- No se guardarán respuestas autenticadas de un tenant en cachés compartidas del navegador o CDN.

## 5. Marca RestoApp.pe

### 5.1 Uso de los archivos entregados

| Archivo | Uso previsto |
|---|---|
| `logo para app.png` | favicon, iconos PWA, Apple touch icon y variante maskable |
| `RestoApp logo para modo claro.png` | isotipo sobre superficies claras |
| `RestoApp logo para modo oscuro.png` | isotipo sobre superficies oscuras |
| `RestoApp para modo claro.png` | lockup completo sobre superficies claras |
| `RestoApp para modo oscuro.png` | lockup completo sobre superficies oscuras |

Durante la implementación:

- Los originales se incorporarán con Git LFS, según la política del repositorio sobre binarios.
- Se producirán derivados optimizados para 16, 32, 180, 192, 512 y 1024 px.
- Se conservará transparencia y zona segura del icono maskable.
- Un componente `BrandLogo` elegirá la variante correcta por tema y contexto.
- Login, sidebar, splash, manifest, favicon, pantalla de instalación, tickets, PDFs y correos usarán la misma fuente de marca.
- Las variables visuales se extraerán del azul marino y naranja del logo. Se verificará contraste WCAG AA en claro, oscuro y navy.

### 5.2 Limpieza completa

La limpieza incluye más que textos visibles:

- Nombres de clientes anteriores.
- Prefijos técnicos históricos.
- Dominios y correos de ejemplo.
- Nombres de imágenes, contenedores, redes, volúmenes y bases.
- Usuarios y contraseñas demo con nombres heredados.
- Exchange AMQP y variables de entorno.
- Paquetes Postman.
- Fixtures, snapshots, documentos, comentarios y títulos Swagger.
- Metadatos PWA, tickets, PDFs y plantillas de correo.

Los datos demo pasarán a nombres neutrales como `Restaurante Demo`, `Sede Principal`, `Administrador Demo` y dominios reservados de ejemplo.

No se reescribirá el historial Git. El árbol de trabajo y los artefactos nuevos sí deben quedar limpios. Este documento es transitorio y se reemplazará por documentación final sin nombres de clientes antes del lanzamiento.

## 6. Estrategia de fusión de App Base, Mi Narcita y La Barra

No se hará una copia de carpetas completa. Cada función se portará por dominio y se adaptará al contrato multitenant.

Orden de precedencia cuando los repositorios discrepen:

1. Ganan las reglas de seguridad, marca y multitenancy definidas para RestoApp SaaS.
2. Se preserva el comportamiento ya validado en App Base.
3. Se incorpora la mejora más reciente y comprobada de La Barra.
4. Mi Narcita completa las capacidades que no existan en las otras dos fuentes.
5. Si dos implementaciones resuelven lo mismo de forma diferente, se escribe una prueba de caracterización y se elige por resultado, no por fecha de archivo.

El código de La Barra nunca conservará su marca, configuración local, seeds, dominio ni supuestos de un solo restaurante.

Orden recomendado:

1. Contratos compartidos y tipos.
2. Migraciones Prisma del dominio.
3. Servicio y controladores.
4. Eventos y proyecciones.
5. API y hooks del frontend.
6. Pantallas y componentes.
7. Pruebas unitarias, contrato, integración y e2e.
8. Evaluación de paridad y aislamiento.

Matriz de aceptación:

| Capacidad donante | Resultado exigido en App Base |
|---|---|
| Carta pública QR | Ruta pública por tenant y sede, sin filtrar datos privados |
| Facturación completa | Empresa por tenant, credenciales cifradas, notas y comprobantes |
| Auditoría de anulaciones | Actor, motivo, tenant, sede, recurso y fecha |
| Inventario avanzado | Almacén, cocina, kardex, conteo, movimientos, categorías y mermas |
| Caja avanzada | Correlativos, pendientes, cierre Z, conciliación e impresión |
| Administración | Editar usuarios, membresías, roles y sedes |
| Reportes | Estadísticas y exportaciones filtradas por tenant y sede |
| Tiempo real | Salas separadas por tenant y sede |
| Tamaños de plato | Variantes y precios aislados por tenant y sede |
| Múltiples RUC por sede | Empresas fiscales separadas, credenciales cifradas y permisos explícitos |
| Alertas sonoras | Preferencias por usuario, tenant y sede, con control de accesibilidad |
| Impresión de cocina | Cola por tenant y sede, reintentos, auditoría y fallback web |
| Operación local heredada | Equivalentes SaaS de onboarding, health, backups e impresión |

Una función solo se considera portada cuando backend, UI, permisos, pruebas y documentación estén completos.

## 7. Fases de implementación

### Fase 0. Congelar y medir la base

Entregables:

- Crear rama de migración desde `App Base\sistema`.
- Registrar commit base y estado sucio sin sobrescribir cambios del usuario.
- Ejecutar build, typecheck, lint y tests existentes mediante Nx.
- Exportar el grafo de proyectos y una matriz de rutas, APIs, tablas y eventos.
- Crear inventario de paridad de tres vías: App Base, Mi Narcita y La Barra.
- Clasificar cada diferencia de La Barra como portar, adaptar a SaaS o excluir por ser escritorio/local/branding.
- Confirmar qué instalaciones contienen datos reales.

Gate:

- Baseline reproducible y todos los fallos preexistentes documentados.

### Fase 1. Base neutral y marca

Entregables:

- Centralizar metadatos de marca.
- Integrar los cinco logos y sus derivados.
- Sustituir marcadores de letra en login, sidebar y splash.
- Neutralizar fixtures, infraestructura y documentación.
- Renombrar recursos técnicos heredados con una estrategia compatible.
- Añadir una comprobación CI de residuos de marca.

Gate:

- Cero nombres de clientes anteriores en archivos rastreados, builds, UI, logs de arranque, contenedores y documentación final.

### Fase 2. Paridad funcional con Mi Narcita y mejoras de La Barra

Entregables:

- Portar las capacidades listadas en la sección 2.4.
- Portar o transformar las mejoras listadas en la sección 2.5.
- Conservar compras, multisede, historial de mermas, PDF y mejoras de caja de App Base.
- Resolver diferencias por comportamiento, no por fecha de archivo.
- Crear pruebas de caracterización cuando las dos variantes discrepen.

Gate:

- Matriz de paridad de tres vías al 100 por ciento y ninguna regresión en flujos existentes.

### Fase 3. Control plane SaaS

Entregables:

- Modelos Tenant, Membresía, MembresíaSede, Plan y Entitlement.
- Onboarding de restaurante, administrador y primera sede.
- Selector de restaurante y sede.
- Suspensión y reactivación de tenant.
- Roles de plataforma separados de los roles del restaurante.
- Auditoría de cambios administrativos.

Gate:

- Dos tenants pueden usar nombres de sede, numeración y catálogos iguales sin colisión.

### Fase 4. Tenantización de todos los dominios

Orden sugerido:

1. Contratos y autenticación.
2. Identidad y sedes.
3. Inventario y compras.
4. Mesas y reservas.
5. Pedidos y cocina.
6. Cuentas y caja.
7. Facturación.
8. Reportes.
9. Notificaciones y tiempo real.

Para cada servicio:

- Migración expandir, backfill y contraer.
- Índices y restricciones compuestas.
- RLS y rol de aplicación.
- Contexto tenant en HTTP, eventos y jobs.
- Prueba negativa de acceso cruzado.
- Métricas y logs con tenant seguro.

Gate:

- Ninguna tabla de negocio, evento, archivo, caché o sala WebSocket queda sin tenant.

### Fase 5. Frontend web SaaS

Entregables:

- Login y selección de restaurante.
- Onboarding.
- Navegación por permisos y entitlements.
- Selector de sede limitado a la membresía.
- Caché offline segmentada.
- Estados loading, vacío, error, sin permiso y tenant suspendido.
- Responsive para escritorio, tablet y móvil.
- Temas claro, oscuro y navy con logos correctos.
- PWA instalable con iconos completos.

Se mantendrán los slugs operativos existentes para reducir regresiones. Las rutas nuevas serán aditivas.

Gate:

- Un cambio de tenant no conserva ni muestra datos, filtros, notificaciones o caché del tenant anterior.

### Fase 6. Plataforma web y operación

Entregables:

- Un único frontend en `app.restoapp.pe`.
- API detrás de Kong o gateway equivalente.
- Contenedores sin nombres de cliente.
- PostgreSQL administrado con una base lógica por servicio.
- RabbitMQ administrado o clúster con respaldo.
- Almacenamiento de objetos para comprobantes.
- Migraciones automáticas controladas por release.
- Backups y restauración ensayada.
- Observabilidad con tenant, correlación y alertas.
- CI/CD con imágenes versionadas por commit, sin depender de `latest` para rollback.

Gate:

- Despliegue de staging repetible, rollback probado y restauración validada.

### Fase 7. Migración y lanzamiento

Para una plataforma limpia:

- Crear solo tenants demo neutrales.
- No importar datos ni credenciales de restaurantes anteriores.

Si luego se decide migrar un restaurante existente:

1. Exportar datos sin secretos.
2. Crear tenant y sedes destino.
3. Mapear IDs en tablas de correspondencia.
4. Importar catálogos, usuarios, operación y documentos en orden dependiente.
5. Conciliar conteos, importes, correlativos y hashes de archivos.
6. Ejecutar un periodo de solo lectura en el origen.
7. Hacer corte y conservar snapshot recuperable.

Gate:

- Conciliación firmada y cero accesos cruzados durante smoke tests.

## 8. Estrategia de pruebas

### 8.1 Gates rápidos

- Unit tests de contexto tenant y permisos.
- Contract tests del envelope de eventos.
- Tests de índices y restricciones compuestas.
- Test de limpieza de marca.
- Test de claves de caché por tenant.
- Test de selección de logo por tema.

### 8.2 Integración

Crear dos tenants con datos deliberadamente iguales y comprobar:

- Listar, leer, crear, modificar y eliminar.
- Acceso por ID conocido de otro tenant.
- Consultas de reportes y exportaciones.
- Reintentos e idempotencia.
- Eventos fuera de orden y duplicados.
- Jobs programados.
- URLs firmadas de archivos.
- Notificaciones y WebSocket.

Toda prueba cruzada debe devolver 404 o 403 según el contrato, nunca datos parciales.

### 8.3 E2E

Flujos mínimos:

1. Alta de tenant y primera sede.
2. Invitación de administrador y mesero.
3. Mesa a pedido, cocina, cuenta, pago y comprobante.
4. Compra a recepción y movimiento de inventario.
5. Reserva y carta pública QR.
6. Cambio de sede.
7. Cambio de tenant.
8. Suspensión del tenant.
9. Intento de acceso cruzado desde API y navegador.

### 8.4 Seguridad

- Denegar por defecto.
- Validar permisos en cada request.
- No confiar tenant, usuario, rol, precio o sede enviados por el cliente.
- Probar IDOR/BOLA con IDs reales de otro tenant.
- Probar RLS usando el mismo rol que producción.
- Probar que el propietario de tablas no sea el rol runtime.
- Probar que backups y workers incluyan todos los tenants de forma controlada.
- Revisar secretos, CORS, cookies, CSRF, rate limits y sesiones.

### 8.5 Rendimiento y accesibilidad

- Capturar baseline antes de agregar tenant.
- Comparar p95 de los flujos principales después de cada dominio.
- Revisar índices con planes de consulta reales.
- Ejecutar Lighthouse y pruebas de teclado.
- Mantener foco visible, contraste AA, targets táctiles y movimiento reducido.

## 9. Despliegue gradual y rollback

La migración de esquemas seguirá expandir, backfill y contraer:

1. Agregar columnas nullable e índices concurrentes cuando aplique.
2. Desplegar código que escribe datos antiguos y nuevos si existe producción activa.
3. Backfill por lotes con reporte antes/después.
4. Activar validaciones y RLS en modo de verificación.
5. Hacer `tenantId` obligatorio.
6. Retirar compatibilidad antigua en una versión posterior.

Cada fase tendrá:

- Snapshot previo.
- Script de rollback.
- Health checks.
- Smoke tests.
- Métrica de error y latencia.
- Registro de la versión de contratos y base de datos.

## 10. Riesgos principales

| Riesgo | Mitigación |
|---|---|
| Confundir sede con tenant | Modelo Tenant y Membresía explícito |
| Filtración por consulta sin filtro | Contexto central, RLS y tests cruzados |
| Filtración por eventos o WebSocket | tenant obligatorio en envelope y rooms |
| Filtración por caché offline | claves y purga por tenant y usuario |
| Colisión de únicos existentes | restricciones compuestas antes del backfill |
| Copiar secretos o datos de donantes | lista de exclusión y revisión de Git |
| Perder funciones al fusionar variantes | matriz de paridad y pruebas de caracterización |
| Romper facturación SUNAT | migración separada y pruebas beta por tenant |
| Alto costo de 11 servicios | mantener límites actuales primero y medir antes de consolidar |
| RLS omitido por rol privilegiado | rol runtime sin ownership ni BYPASSRLS |

## 11. Criterios de finalización

El proyecto se considera listo cuando:

- La marca visible y técnica es RestoApp.pe.
- Los cinco recursos de marca están integrados y optimizados.
- El árbol final no contiene identidad de restaurantes donantes.
- Existe paridad funcional con Mi Narcita, excepto personalizaciones explícitamente excluidas.
- Las mejoras nuevas de La Barra están portadas o tienen un equivalente SaaS documentado y probado.
- Todos los datos de negocio tienen tenant.
- HTTP, eventos, WebSocket, archivos y caché respetan el mismo tenant.
- Las pruebas con dos tenants demuestran aislamiento de lectura y escritura.
- Build, lint, typecheck, unit, integración, e2e y evaluaciones están verdes.
- Staging web funciona con backup, restauración y rollback probados.
- La documentación describe RestoApp.pe SaaS y ya no el modelo de un VPS por cliente.

## 12. Primer lote de implementación

El primer lote debe ser pequeño y verificable:

1. Confirmar la carpeta fuente correcta.
2. Crear baseline de pruebas.
3. Integrar `BrandLogo` y los activos de marca.
4. Neutralizar el login, sidebar, PWA y configuración central.
5. Crear la matriz automatizada de paridad de tres vías.
6. Incorporar primero tamaños de plato y soporte de dos RUC por sede, porque cambian contratos y modelos que luego recibirán `tenantId`.
7. Diseñar y probar el contrato `TenantContext` y el envelope de eventos v2 antes de migrar esquemas.

No se debe comenzar el backfill de tenant ni copiar módulos completos hasta que este gate esté verde.
