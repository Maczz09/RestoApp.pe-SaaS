# REST-105 y REST-106: Pre-Cuenta y Solicitar Cuenta

## Flujo del salón

La mesa ocupada conserva sus acciones de tomar/agregar pedido, anular y cobrar.
Al cargar su cuenta activa aparecen dos acciones independientes:

- **Pre-Cuenta:** abre una vista informativa de productos, cantidades, notas,
  importes y total de la atención. Excluye líneas canceladas o sin stock. Puede
  imprimirse desde una ventana dedicada del navegador, sin sidebar ni modal.
  No crea pagos, no cierra cuenta, no libera mesa ni emite un documento fiscal.
- **Solicitar Cuenta:** registra una solicitud para la cuenta activa y confirma
  el envío. El botón se bloquea mientras envía y tras el éxito. Errores permiten
  reintentar; desconectado no se envían solicitudes. El estado de mesa/cuenta y
  los importes no cambian por solicitar.

## Caja

La sección **Cuentas solicitadas** muestra mesa, solicitante, código de atención
y total. **Atender cuenta** abre el mismo cobro directo ya existente. Las
solicitudes se consultan cada 3 segundos mientras la vista está activa y con
conexión. Al pagarse, cerrarse o cancelarse la cuenta deja de aparecer en la
siguiente actualización; no se mantienen avisos de cuentas históricas.

La actualización usa polling corto, no introduce otro canal WebSocket. El cobro
directo sigue disponible aunque no haya solicitud o falle la consulta de avisos.

## Contrato e integridad

- `POST /cuentas/:cuentaId/solicitar-cuenta`: ADMIN, MESERO o CAJERO.
- `GET /cuentas/solicitudes-cuenta`: ADMIN, CAJERO o MESERO. El mesero consulta el estado para identificar las mesas solicitadas; la alerta sonora de Caja permanece en los perfiles de cobro.
- Tenant, sede y solicitante provienen de los claims verificados de sesión,
  nunca del body. Se exige sede activa y se valida su pertenencia cuando hay
  una lista de sedes autorizadas en el token.
- Solo se acepta una cuenta ABIERTA en esa sede y tenant. Compatibilidad de
  datos legados: un tenantId nulo se acepta únicamente en la sede firmada.
- La fila de cuenta se bloquea durante la solicitud para serializarla con el
  cierre; el índice único `cuentaId` evita duplicados por doble toque o retry.
- La solicitud conserva su primera fecha y solicitante. No altera totales,
  snapshot de platos, estado ni transacciones.

La migración aditiva `20261119090000_solicitudes_cuenta` crea una tabla aparte
con índice tenant/sede/fecha; no modifica datos existentes ni credenciales.
Desplegar requiere reconstruir `servicio-cuentas` y la PWA, y aplicar las
migraciones de cuentas con el mecanismo de arranque existente.

## Evidencia

- `solicitudes-cuenta.service.spec.ts`: idempotencia, cuenta activa, rechazo de
  tenant/sede ajenos, cuenta cerrada/pagada/cancelada, filtrado de solicitudes
  vigentes y extracción de actor desde sesión.
- `AccionesCuentaMesa.test.tsx`: Pre-Cuenta sin mutaciones, notas/exclusión de
  anulados, impresión y solicitud, bloqueo tras éxito y retry ante error.
- `SolicitudesCuentaAlerts.test.tsx`: alerta en Caja, enlace al cobro existente,
  desaparición tras cierre reportado y ausencia de consulta para meseros.
- `preCuentaPrint.spec.ts`: documento aislado, datos tratados como texto y
  aviso si el navegador bloquea la ventana.
- Regresiones MesasScreen/CajaScreen conservadas.

La validación final incluye 109 pruebas de cuentas y 1.124 del frontend, además
de las pruebas de navegador y contenedores descritas en
[RESTOAPP_V2_IMPLEMENTACION.md](RESTOAPP_V2_IMPLEMENTACION.md). Los contenedores
de producción no se han modificado desde este trabajo.
