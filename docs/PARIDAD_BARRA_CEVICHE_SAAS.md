# Paridad de La Barra del Ceviche y RestoApp SaaS

Fecha: 19 de noviembre de 2026. Referencia: `D:/Restaurantes/la-barra-del-ceviche`, revisión `bb97e67de0d59566e423a7c5fb830c4c966b5ce4`. Destino: `D:/SaaS/RestoApp`. Esta revisión incluye REST-101 a REST-106 y las diferencias web detectadas en la migración anterior.

## Método y alcance

El inventario reproducible está en [audits/parity-20261119.json](audits/parity-20261119.json). Compara código de frontend, servicios, contratos y migraciones; excluye pruebas y código generado. La revisión funcional distingue código ya presente, funciones incorporadas y adaptaciones necesarias para separar restaurantes y sedes. Una coincidencia entre archivos no demuestra funcionamiento ni aislamiento en ejecución. Los ensayos de contenedores y las pruebas de navegador se documentan por separado.

Resultado del inventario: 455 rutas revisadas, 309 idénticas, 131 con diferencias y 15 sin equivalente literal, explicadas más abajo.

Para regenerar el inventario:

```powershell
node scripts/audit-saas-parity.mjs --source D:/Restaurantes/la-barra-del-ceviche --target . --output docs/audits/parity-20261119.json
```

## Comparación por módulo

| Módulo | Funciones contrastadas con la referencia | Resultado en SaaS |
|---|---|---|
| Inicio | Operación crítica, ventas por hora, top de platos/productos con periodos y estaciones, platos con demora, salón, cocina, caja, QR y reservas próximas | Conservadas las vistas existentes de la referencia; consultas bajo la sesión del restaurante y sede. |
| Mesas y ubicaciones | Crear/editar/eliminar ubicaciones, agrupación visual, selección de mesa principal, consumo activo, nuevas comandas | Mesa libre abre directamente el comandero. Unión de mesas ocupadas mediante operación recuperable entre servicios; conserva pedidos, notas y cuenta consolidada. Se reforzó el control de tenant en accesos por ID y unión anterior. |
| Pedidos | Salón/delivery/para llevar, tablero/lista, sonidos, anotaciones, anulación, estado por plato | Se mantienen las notas por porción y el avance individual de cocina en la vista del mesero. Se incorporaron detalles y auditoría de anulaciones. |
| Cocina / barra | Estaciones, nuevos/en preparación/listos, indicadores, sonido y detalle de notas | Conservado el KDS web y su actualización de ítems. Vista de impresión de cocina disponible mediante navegador; el agente local de impresión automática está excluido. |
| Caja | Apertura/cierre, ingresos/egresos, descuentos, propinas, pagos directos y de mesa | REST-101 exige Ticket/Boleta/Factura. REST-104 registra todos los medios del cobro en una transacción atómica. El cierre conserva importes por canal. La corrección del medio actualiza movimiento y detalle reimprimible. |
| División de cuenta | Partes iguales y selección por producto | REST-103 persiste la división en PostgreSQL por unidades, con documento y pagos propios por parte. Reabrir la pantalla conserva lo pagado. Nuevos consumos generan una parte adicional; la mesa se libera al cancelar el saldo completo. |
| Atención del mozo | Pre-cuenta, solicitud de cobro, mesas unidas | REST-105 imprime una pre-cuenta informativa sin cerrar consumo. REST-106 persiste la solicitud, muestra el grupo y alerta a Caja; el cajero puede cobrar sin solicitud previa. |
| Reservas | Listado, filtros/búsqueda, fechas y correlativo | Incorporados el correlativo y los ajustes de consulta/fechas en Lima manteniendo el alcance de sede. |
| Categorías | Carta cocina, carta barra, inventario; padre/dependiente; edición y eliminación | Se recuperó la gestión del frontend y su confirmación de eliminación con productos asociados. |
| Carta / menú | Tamaños, precios, disponibilidad, estaciones, categorías, orden y filtros, menú del día | Se conserva el catálogo y se incorporaron estilos y controles que faltaban al comandero y a sus tamaños/categorías. |
| Inventario | Productos en venta, almacén y almacén de cocina | Se incorporaron las áreas faltantes, edición de productos, categorías de insumos, movimientos, kardex, conteo físico y exportación. Se conserva el filtro por mínimo/categoría. |
| Mermas | Descarte manual, historial, edición y eliminación | Incorporados pantalla y modales de gestión, con actualización de consultas. |
| Compras | Proveedores, recepción/insumos, historial y comprobantes adjuntos | Incorporados la gestión de insumos del almacén de cocina y el visor de comprobantes. La descarga de adjuntos ahora comprueba tenant y sede. |
| Historial de caja | Reimpresión, comprobante, cierre Z, edición de transacción | Recuperadas las páginas de impresión que faltaban. Ticket usa el documento del cobro; Boleta/Factura consulta la fracción emitida, sin imprimir toda la mesa por error. |
| Reportes | Ventas, productos, periodos y estadísticas | Incorporadas mediana, moda y productos menos vendidos, conservando los filtros del SaaS. |
| Usuarios | Alta, edición, rol, activación, sede, teléfono y credenciales | Se recuperó la edición y se ajustó el inicio de sesión a las membresías del restaurante. La edición está integrada en `UsuariosScreen`, en lugar del modal aislado del proyecto local. |
| Sedes / empresas fiscales | Nombre, dirección, teléfono, RUC, configuración electrónica opcional, SOL y P12 | Conservadas sedes y configuración opcional. Eliminado el límite artificial de dos emisores; credenciales cifradas y selección por tenant/sede. |
| Facturación | Boleta/Factura, documentos, respuesta SUNAT, notas y reintentos | Emisión independiente por cobro y detalle de fracción; guarda y analiza el CDR. El flujo de cierre anterior no vuelve a emitir cobros documentados. Caché SOAP separado por credenciales. |
| Auditoría | Anulaciones y eliminaciones autorizadas | Recuperada la vista de anulaciones y sus consultas, conservando las auditorías y permisos ya presentes. |
| Carta pública / QR | Catálogo público y presentación de carta | Incorporada la carta tipo libro con alternativa de lista. Canal público de disponibilidad separado de las notificaciones privadas y limitado a la sede. |
| Consola SaaS | Superadministración, restaurantes, planes, cobros, observación y acceso al negocio | Se conservó la consola propia del SaaS y los dominios anidados; estas funciones no provienen de la aplicación local. No se reemplazan con datos de un restaurante. |

## Archivos sin equivalente literal

El inventario señala quince rutas de referencia sin el mismo nombre en SaaS. No son quince módulos ausentes:

- Cuatro pertenecen al servidor local: `local-runtime.api.ts`, `useLocalServerInfo.ts`, `ConfiguracionInicialScreen.tsx` y `ServidorLocalScreen.tsx`. Excluidos por el alcance web solicitado.
- `EditarUsuarioModal.tsx` tiene su funcionalidad integrada en la pantalla de usuarios del SaaS.
- Diez son migraciones históricas cuyo cambio ya está cubierto por migraciones existentes o consolidadas del SaaS: cola/correlativos de Caja, almacén de cocina de Compras, teléfonos de Identidad, operación de Pedidos y correlativo de Reservas. La evaluación de migraciones ensaya instalación nueva y actualización desde la revisión anterior; verifica las columnas de los clientes Prisma actuales.

Las diferencias de autenticación, rutas, contratos y consultas se mantienen cuando son necesarias para separar negocios. No se copian certificados, claves SOL, datos operativos, marcas ni configuraciones locales de La Barra del Ceviche.

## Evidencia y límites

Las pruebas unitarias cubren frontend y servicios; las evaluaciones ejercitan dinero en céntimos, contratos, firmas/CDR, operaciones de unión y aislamiento. Playwright comprueba el comandero desde mesa libre y el cobro con documento obligatorio y tres medios. `saas-v2-runtime.eval.mjs` ensaya el recorrido completo mediante el gateway y las bases reales de contenedores locales aislados. La evidencia resumida se guarda en `audits/saas-v2-runtime-20261119.json`.

El ensayo de SUNAT usa un simulador SOAP con firma XML real y análisis del CDR. No demuestra aceptación de documentos reales por SUNAT. La impresión silenciosa requiere un agente local que no forma parte del alcance web. La unión de cuentas con pagos previos, pagos en cola o divisiones guardadas se rechaza para preservar documentos históricos; sí admite consumos activos sin cobrar. Una división cobrada permite anexar consumo, pero no alterar productos originales ya distribuidos.

Esta entrega no modifica el VPS. La actualización, respaldo y reinicio se describen en [RESTOAPP_V2_IMPLEMENTACION.md](RESTOAPP_V2_IMPLEMENTACION.md). La puesta en producción requiere ejecutar ese procedimiento y verificar los emisores y el flujo operativo con el responsable del negocio.
