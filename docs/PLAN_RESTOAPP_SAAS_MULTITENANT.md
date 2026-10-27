# Plan de implementación: RestoApp.pe web SaaS multitenant

Estado: recuperación correctiva en ejecución sobre `D:\SaaS\RestoApp`.

Última actualización: 22 de septiembre de 2026.

Este documento define cómo convertir el sistema actual en la base limpia de RestoApp.pe, conservar la cobertura funcional de Restaurante Mi Narcita y operar una sola plataforma web para múltiples restaurantes con aislamiento estricto de datos.

## 1. Decisión recomendada

La base de trabajo y destino de la implementación es `D:\SaaS\RestoApp`.

Esta carpeta ya contiene la migración SaaS iniciada y cinco commits locales por delante de `upstream/main`. No se repetirá la migración sobre otra copia. Se corregirá esta rama conservando lo que esté validado y reemplazando lo incompleto.

Motivos:

- Ya contiene la marca central `RestoApp.pe`, los cinco recursos gráficos entregados y el primer modelo `Tenant`/`Membresia`.
- Ya tiene los 11 dominios operativos: identidad, mesas, pedidos, cuentas, reservas, inventario, notificaciones, caja, reportes, facturación y compras.
- Ya incluye soporte multisede, compras reales y el flujo web React/Vite.
- Es el repositorio que el usuario ya está probando como RestoApp SaaS.

Las otras carpetas se usarán como donantes de funciones y evidencia:

- `D:\Restaurantes\App Base\sistema`: referencia del core anterior a la migración.
- `D:\Restaurantes\mi-narcita`: fuente funcional para recuperar todo lo que todavía no está en RestoApp SaaS.
- `D:\Restaurantes\la-barra-del-ceviche`: fuente prioritaria para incorporar las mejoras más recientes que todavía no llegaron al core ni a Mi Narcita.
- `D:\Restaurantes\La barra del ceviche\sistema`: no debe copiarse sobre App Base. La ruta exacta indicada contiene `factuez-grifo-san-jose`, una solución de facturación para grifo basada en Turbo/pnpm, no el sistema restaurantero Nx.

La ruta correcta de La Barra quedó confirmada: `D:\Restaurantes\la-barra-del-ceviche`. La carpeta `D:\Restaurantes\La barra del ceviche\sistema` no es una fuente válida para este trabajo.

### 1.1 Resultado de la auditoría correctiva inicial

- La PWA, Kong y los servicios principales responden actualmente en el entorno local.
- El login del tenant demo funciona y las rutas de identidad, sedes, mesas, pedidos, inventario, reservas y reportes respondieron correctamente en una verificación directa.
- La suite actual del frontend está verde: 103 archivos y 879 pruebas.
- No existe una consola web de superadministrador de plataforma.
- Existe el rol `PLATFORM_ADMIN` en el backend, pero no tiene rutas ni navegación propias en el frontend y termina usando el fallback de la aplicación operativa.
- El seed actual no crea un superadministrador de plataforma.
- Existen `Tenant.slug` y `TenantDomain`, pero el ingreso por hostname/subdominio no está resuelto de extremo a extremo.
- La migración copió contratos y partes de backend, pero dejó fuera pantallas, flujos y pruebas presentes en Mi Narcita y La Barra.
- Faltan, entre otros, alertas sonoras, gestión visual completa de tamaños, impresión de cocina web, QR en Inicio, inventario de almacén/cocina, kardex, conteo físico, CRUD completo de mermas, auditoría de anulaciones y edición completa de usuarios.

Este baseline no significa que la migración esté terminada. Solo demuestra que el núcleo actual arranca y permite medir cada corrección sin confundir faltantes funcionales con una caída total de servicios.

## 2. Estado observado

### 2.1 Arquitectura actual

- Monorepo Nx.
- React 19, Vite y React Router para la PWA.
- NestJS y Prisma en 11 servicios.
- PostgreSQL con base por servicio.
- RabbitMQ para eventos, Kong como gateway y WebSocket para actualizaciones en vivo.
- JWT RS256 para usuarios y HS256 para comunicación entre servicios.
- Outbox transaccional, idempotencia, métricas, trazas y pruebas de resiliencia.

### 2.2 Multitenancy iniciado, todavía incompleto

La migración agregó `Tenant`, `TenantDomain`, `Membresia`, `MembresiaSede`, `tenantId` en contratos y varios esquemas, selección de tenant, rooms WebSocket por tenant y envío de `X-Tenant-Id` desde la PWA.

Todavía no es una implementación SaaS cerrada:

- Varias columnas `tenantId` siguen siendo opcionales y existe fallback al tenant demo.
- No hay RLS ni rol runtime sin `BYPASSRLS` demostrado por pruebas.
- No existe resolución obligatoria por hostname y `TenantDomain` no gobierna el login.
- No existe consola de plataforma para alta, suspensión, reactivación, plan, límites, dominios y auditoría de tenants.
- No hay seed ni flujo de credenciales para el superadministrador.
- No está demostrada la cobertura tenant en cada query, evento, idempotency key, job, archivo y caché.
- La misma PWA mezcla las responsabilidades de plataforma y restaurante.

Una sede no equivale a un tenant. El tenant representa al restaurante o grupo empresarial y contiene una o más sedes. La consola de plataforma no puede reutilizar permisos del administrador de restaurante.

### 2.3 Marca integrada, limpieza técnica pendiente

Los cinco archivos de marca entregados ya están copiados sin alteración en `apps/pwa-cliente/public/brand` y `apps/pwa-cliente/src/assets/brand`. `BrandLogo` ya se usa en login y navegación.

Todavía quedan referencias históricas en fixtures, scripts de compatibilidad, Postman, documentación, dominios de ejemplo y credenciales legacy. Deben quedar fuera del producto, de los seeds finales y de cualquier salida visible. La limpieza se verificará con un gate automatizado sin borrar migraciones ni evidencia histórica necesaria para reconstruir datos.

### 2.4 Funciones de Mi Narcita ausentes o incompletas en RestoApp SaaS

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

RestoApp SaaS tiene cambios propios que se deben conservar, entre ellos compras reales, selector de sedes, historial de mermas, PDF de comprobante y mejoras recientes de caja.

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

### 3.1 Matriz funcional obligatoria por tenant

Cada tenant nuevo debe recibir los módulos, permisos y configuraciones base. No se aceptará una demo especial con más funciones que los tenants creados después.

| Superficie | Comportamiento exigido |
|---|---|
| Inicio | Estado crítico, ventas por hora, actividad reciente, salón, cocina, caja, QR público y próximas reservas |
| Rankings | Top platos y top productos con Hoy, Semana, Mes, Trimestre, Año, Todo, Verano, Otoño, Invierno y Primavera |
| Mesas | Ubicaciones, alta y edición de ubicaciones, mesas por zona, unir y separar mesas, reservas y toma de pedido |
| Pedidos | Salón, delivery y para llevar; tablero y lista; estados en vivo; sonido audible en tablet después del primer gesto |
| Cocina | KDS por estación, sonido de nuevos tickets, SLA, pase e impresión de cocina |
| Impresión web | Cola por tenant y sede, reintentos, estado, auditoría y fallback de impresión del navegador; sin Tauri ni servidor local obligatorio |
| Caja | Apertura, movimientos, cuentas, pagos, arqueo, cierre, historial, detalle, impresión y conciliación |
| Reservas | Crear, confirmar, cancelar, disponibilidad, mesa y correlativo por tenant/sede |
| Categorías | Área Carta Cocina, Carta Barra o Inventario; jerarquía padre/hija; editar, activar y eliminar con bloqueo o cascade explícito |
| Carta / Menú | CRUD de platos, categorías, estación, disponibilidad, tamaños, precios por tamaño, orden y filtros completos |
| Inventario | Productos de venta, almacén, almacén de cocina, insumos, categorías, stock mínimo, movimientos, kardex, conteo, exportación y mermas |
| Compras | Proveedores, insumos, órdenes, recepción, comprobantes adjuntos y trazabilidad a inventario |
| Reportes | Ventas, productos/platos, meseros, periodos, sedes, exportaciones y aislamiento por tenant |
| Usuarios | Alta, edición, teléfono, reset de contraseña, rol, estado, membresía y sedes permitidas |
| Sedes | Nombre, dirección, teléfono, RUC principal, estado, QR y configuración fiscal |
| Facturación | Dos o más empresas/RUC por sede, series, correlativos, comprobantes disponibles, notas, SOL, certificado P12 y auditoría |
| Auditoría | Eliminaciones, anulaciones de pedido/ítem/atención, actor, motivo, tenant, sede, fecha y recurso |
| Carta pública | URL y QR por tenant/sede, solo datos públicos, tamaños y actualización en vivo |

### 3.2 Consola de superadministrador

El superadministrador de RestoApp debe entrar a una superficie separada de la operación del restaurante. Su ruta inicial será `/platform` y tendrá como mínimo:

- Resumen de tenants activos, suspendidos, en onboarding y con incidencias.
- Alta de tenant con nombre, slug, plan, administrador propietario y primera sede.
- Generación y validación del subdominio `{slug}.restoapp.pe`.
- Edición, suspensión, reactivación y auditoría del tenant.
- Gestión de planes, entitlements y límites por módulo.
- Vista de salud de gateway, servicios, colas y bases sin exponer secretos.
- Acceso de soporte temporal y auditado, sin suplantación silenciosa.
- Registro de dominio personalizado y validación de propiedad en una fase posterior.

Las credenciales de plataforma se crearán con un seed idempotente para desarrollo y variables obligatorias en producción. No se incluirá una contraseña productiva fija en Git.

### 3.3 Subdominios y resolución de tenant

1. El host se normaliza y valida en gateway y backend.
2. `app.restoapp.pe` sirve login global y consola de plataforma.
3. `{slug}.restoapp.pe` resuelve exactamente un `TenantDomain` activo.
4. El usuario solo puede iniciar o continuar sesión si tiene membresía en ese tenant.
5. El `tenantId` del token debe coincidir con el tenant resuelto por host.
6. Headers de tenant enviados por el navegador no pueden cambiar el contexto efectivo.
7. En desarrollo se soportará `{slug}.localhost` y una alternativa documentada cuando el navegador no resuelva subdominios locales.
8. La carta pública usará el contexto del tenant y la sede sin exponer endpoints privados.

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

## 6. Estrategia de fusión de RestoApp SaaS, App Base, Mi Narcita y La Barra

No se hará una copia de carpetas completa. Cada función se portará por dominio y se adaptará al contrato multitenant.

Orden de precedencia cuando los repositorios discrepen:

1. Ganan las reglas de seguridad, marca y multitenancy definidas para RestoApp SaaS.
2. Se preserva el comportamiento ya validado en RestoApp SaaS y, como referencia anterior, en App Base.
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

| Capacidad donante | Resultado exigido en RestoApp SaaS |
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

- Trabajar sobre la rama actual de `D:\SaaS\RestoApp` y registrar los cinco commits previos como baseline de la migración fallida.
- Registrar commit base y estado sucio sin sobrescribir cambios del usuario.
- Ejecutar build, typecheck, lint y tests existentes mediante Nx.
- Exportar el grafo de proyectos y una matriz de rutas, APIs, tablas y eventos.
- Crear inventario de paridad de cuatro vías: RestoApp SaaS, App Base, Mi Narcita y La Barra.
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
- Conservar compras, multisede, historial de mermas, PDF y mejoras de caja que ya funcionan en RestoApp SaaS.
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

## 12. Orden de ejecución correctiva

Los activos de marca, el baseline y parte de tamaños/facturación ya existen. La recuperación se ejecutará en lotes verticales, cada uno con backend, frontend, permisos, migración, pruebas y evals.

### Lote A. Acceso SaaS y conectividad

1. Crear consola `/platform` y guard exclusivo `PLATFORM_ADMIN`.
2. Añadir endpoints de plataforma para listar, crear, editar, suspender y reactivar tenants.
3. Crear seed idempotente del superadministrador de desarrollo y documentar credenciales locales.
4. Resolver tenant por host/subdominio y comprobar coincidencia host, sesión y membresía.
5. Eliminar el fallback inseguro a tenant demo fuera del entorno de desarrollo.
6. Agregar health/readiness público limitado y una matriz de smoke tests de Kong a los 11 servicios.

Gate: el superadministrador aterriza en `/platform`; al crear un tenant aparecen su dominio y administrador, pero **ninguna sede**. El propietario crea su primera sede en una pantalla de bienvenida; dos tenants no pueden verse entre sí.

### Lote A2. Consola comercial y auditoría de plataforma

Despliegue VPS (2026-10-26): raíz `restoapp.mavricitas.com`, negocios
`<slug>.restoapp.mavricitas.com`, DNS Cloudflare y Nginx existente. La release
reproducible se genera con `scripts/vps/release.mjs --build --save`; incluye
13 imágenes de aplicación, Compose aislado, TLS wildcard DNS-01 y operaciones
para crear el primer superadmin sin demo y migrar dominios con snapshot.
Procedimiento completo: [DESPLIEGUE_VPS_MAVRICITAS.md](DESPLIEGUE_VPS_MAVRICITAS.md).

1. Catálogo de planes administrable (nombre, código, tarifa PEN, duración de ciclo y estado). Los importes iniciales son marcadores de configuración, no precios publicados. Una migración incorpora los códigos heredados ya asignados a tenants (como `ENTERPRISE`) sin cambiarles el plan ni inventar un precio; el superadministrador debe configurar su tarifa.
2. Cartera con vencidos, próximos siete días, al día y sin fecha. Registrar pagos manuales con referencia y períodos; cada cambio de vencimiento deja auditoría. Una pasarela de cobro, facturación de la suscripción y conciliación bancaria quedan como integración posterior, no se simulan.
3. Gestión de superadministradores: crear, activar/desactivar y restablecer contraseña, sin permitir autodesactivación ni eliminar el último administrador activo.
4. La auditoría ofrece dos entradas separadas: `/platform/tenants/:id/observe` mantiene el resumen central y `/platform/tenants/:id/admin/inicio` presenta la navegación y las áreas operativas del negocio en **solo lectura**. Esta última muestra Inicio, Mesas, Pedidos, Cocina, Caja, Reservas, Inventario, Reportes, Usuarios y Sedes con los datos disponibles de los endpoints de plataforma; actualiza cada diez segundos y registra la entrada antes de consultar al tenant. No se expide un token del propietario ni se permiten mutaciones del negocio. Las respuestas de microservicios se validan por contrato y no se guardan en la caché offline. Esta vista no suplanta una sesión ADMIN ni reproduce todavía los formularios de Carta, Compras, Categorías o Facturación: para paridad visual y de detalle total hacen falta consultas de auditoría adicionales por servicio, nunca permisos de escritura por suplantación.
5. En desarrollo, `localhost` puede resolver el tenant del JWT solo con la bandera del Compose local `TENANT_LOCALHOST_DEV=true`. Producción la omite y exige subdominio/dominio válido. El frontend usa API del mismo origen.

Gate: los planes y estados de cobro persisten en PostgreSQL; un pago ajusta vencimiento de forma transaccional y auditada; el observador nunca puede escribir; un tenant sin sede no queda atrapado en skeleton ni requiere demo.

### Lote B. Paridad operativa de La Barra

1. Alertas sonoras en Pedidos y Cocina, con desbloqueo por primer gesto y preferencia persistente por usuario/tenant/sede.
2. Gestión completa de tamaños en Carta y Comandero.
3. QR de carta pública en Inicio.
4. Cola web de impresión de cocina por tenant/sede, reintentos y auditoría.
5. Ajuste de navegación, rutas y distribución visual para igualar el flujo operativo de La Barra.

Gate: una tablet de salón y una de cocina reciben pedidos en vivo, emiten sonido y operan la cola de impresión sin Tauri.

### Lote C. Paridad administrativa de Mi Narcita

1. Inventario de almacén y cocina, categorías de insumo, movimientos, kardex, conteo físico y exportación.
2. CRUD completo de mermas y descarte manual.
3. Auditoría de anulaciones y eliminaciones.
4. Edición completa de usuarios.
5. Impresión de comprobantes y cierre Z.
6. Correlativos y reconciliación cuenta/mesa.

Gate: la matriz de archivos, rutas, contratos y flujos de Mi Narcita queda cubierta en RestoApp SaaS, con tenant obligatorio.

### Lote D. Fiscal, sedes y endurecimiento

1. Dos o más RUC/empresas por sede.
2. Configuración SUNAT opcional con SOL, clave cifrada y certificado P12 protegido.
3. Comprobantes disponibles, series, correlativos, notas y auditoría.
4. RLS, constraints compuestos, rol runtime restringido y pruebas IDOR/BOLA.
5. Backups, restauración por tenant, observabilidad y despliegue de staging.

Gate: facturación beta por tenant aprobada, aislamiento negativo verde y restauración ensayada.

No se declarará un lote terminado por cantidad de archivos copiados. El gate exige comportamiento visible, aislamiento, pruebas y evidencia operativa.
