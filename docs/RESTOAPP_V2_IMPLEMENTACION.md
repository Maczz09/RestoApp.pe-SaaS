# RestoApp SaaS v2: implementación y actualización

Fecha: 19 de noviembre de 2026. Repositorio: `D:\SaaS\RestoApp`.

## Comportamiento implementado

| Tarjeta | Resultado |
| --- | --- |
| REST-101 | Cada cobro del SaaS exige elegir Ticket, Boleta o Factura. Ticket tiene serie TI01 y contador por restaurante/sede; no solicita emisión electrónica. Boleta/Factura validan emisor y cliente antes de cobrar, guardan el cobro y su solicitud fiscal en una transacción, y se emiten mediante outbox. |
| REST-102 | Permite elegir una mesa principal y consolidar cuentas abiertas de mesas ocupadas. Conserva pedidos, notas y cuentas originales como historial; las secundarias quedan vinculadas a la principal. Se pueden agregar comandas después. Una operación interrumpida conserva su fase y se reintenta. |
| REST-103 | División por partes iguales o por unidades de producto, persistida en PostgreSQL. Cada parte tiene importe, propina, detalle, transacciones y estado propios. Se puede cerrar/reabrir la pantalla sin perder lo cobrado. La última parte libera la mesa. |
| REST-104 | Un cobro admite efectivo, tarjeta, Yape, Plin y transferencia con montos parciales. El servidor registra todos los medios o ninguno; el frontend muestra distribuido, faltante/exceso y vuelto de efectivo. |
| REST-105 | El mozo consulta/imprime una pre-cuenta informativa con notas y consumo vigente. No crea pagos, no emite SUNAT y no cambia la cuenta ni la mesa. |
| REST-106 | Solicitud persistente e idempotente del mozo; Caja la consulta cada 3 segundos, muestra el grupo de mesas y avisa con sonido tras habilitar audio. El salón identifica las cuentas solicitadas. Caja conserva el cobro directo sin aviso previo. |

Los filtros de restaurante y sede salen de la sesión verificada. Se reforzaron los accesos por ID de mesas y ubicaciones, incluidos los endpoints anteriores de unión. Las conexiones internas siguen usando tokens de servicio.

## Dinero y documentos

- Se distribuyen importes en céntimos enteros. S/100 entre tres produce S/33.33, S/33.33 y S/33.34.
- La división y cada pago comparten un bloqueo de cuenta. Versiones antiguas, partes pagadas, importes alterados o platos cambiados se rechazan antes de crear transacciones.
- Un pago combinado genera un documento asociado a todas sus transacciones. El ticket reimpreso usa ese documento y sus medios originales.
- Los comprobantes electrónicos de cuentas divididas conservan el detalle de su fracción. El historial consulta ese documento para reimprimirlo y no reutiliza todos los consumos de la mesa.
- El cierre de una cuenta documentada en Caja no vuelve a generar una emisión fiscal por el flujo anterior.
- SUNAT recibe el documento de manera asíncrona. Un fallo de emisión no borra el dinero registrado. Facturación permite revisar/reintentar la solicitud conservada.
- El envío interpreta el XML contenido en el ZIP del CDR: respuesta 0 aceptada, observaciones conservadas y respuestas de rechazo diferenciadas. Se rechazan respuestas ilegibles.
- Se eliminaron el límite global de dos empresas y el límite de dos RUC por sede. Cada emisor recibe un identificador de credenciales único, y el RUC se valida dentro del restaurante. El caché SOAP distingue credenciales, incluso si dos restaurantes usan el mismo RUC.

La validación de identificación para boletas superiores a S/700 se basa en la [orientación de SUNAT para boletas](https://cpe.sunat.gob.pe/tipos_de_comprobantes/boleta). Factura exige RUC y razón social, de acuerdo con la [orientación de SUNAT para facturas](https://cpe.sunat.gob.pe/tipos_de_comprobantes/factura). La lectura del CDR sigue el [manual del programador de SUNAT](https://cpe.sunat.gob.pe/sites/default/files/inline-files/manual_programador%20%281%29.pdf).

## Restricciones que se conservan deliberadamente

La unión consolida cuentas abiertas sin pagos previos. Rechaza cuentas con pagos parciales, cobros en cola o divisiones guardadas; así no reasigna descuentos, propinas ni documentos históricos. Una división sin cobros se puede quitar al volver al pago único. Después del primer cobro, sus asignaciones quedan bloqueadas. Si se agregan platos, **Actualizar división** crea una parte de consumos adicionales conservando lo ya pagado. No permite cambiar o quitar consumos originales ya distribuidos: esos cambios requieren revisar sus documentos y pagos.

La impresión web usa el diálogo del navegador. La impresión silenciosa y la cola del agente de servidor local/Tauri no se incluyen en este SaaS. No se han cambiado certificados, DNS, contenedores ni datos del VPS durante esta implementación.

## Verificación repetible

Validación local de esta entrega: 139 archivos de pruebas del frontend con 1.124 casos aprobados; Caja 118, Cuentas 109 y Mesas 79 casos aprobados. Los diez servicios con cambios de esquema superaron veinte ensayos de instalación/actualización de migraciones. Los contratos compartidos superaron 26 casos y la configuración de despliegue nueve. Las tres pruebas de navegador, incluidas las de cobro en tablet, usan API simulada; la evaluación independiente con contenedores reales superó doce escenarios y un arqueo final de S/430. Incluye consumos nuevos después del primer pago de una división, tres emisores en la misma sede y firma/envío/lectura de CDR con SUNAT simulado. Evidencia: [audits/saas-v2-runtime-20261119.json](audits/saas-v2-runtime-20261119.json).

```powershell
$env:NX_DAEMON='false'
$env:NX_ISOLATE_PLUGINS='false'
npm exec nx -- run pwa-cliente:test --run
npm exec nx -- run pwa-cliente:e2e --args=saas-v2.spec.ts
npm exec nx -- run-many -t test -p servicio-caja,servicio-cuentas,servicio-mesas,servicio-pedidos,servicio-facturacion,servicio-compras,servicio-inventario,servicio-reservas,servicio-reportes,servicio-identidad,servicio-notificaciones --parallel=2 --runInBand
node scripts/saas-v2-migrations.eval.mjs --baseline b1be0a3
```

`saas-v2-migrations.eval.mjs` ejecuta las migraciones en PostgreSQL embebido, tanto desde cero como partiendo de las migraciones ya versionadas; comprueba además las columnas que necesitan los clientes Prisma actuales. No sustituye un ensayo de restauración del VPS.

`scripts/saas-v2-runtime.eval.mjs` verifica los flujos contra contenedores locales aislados. Exige un proyecto con prefijo `restoapp-vps-qa-`, una URL local y que su puerto pertenezca al gateway de ese proyecto. Crea restaurantes y usuarios de prueba, prueba notas individuales, unión, solicitud, pago mixto, división y cierre. El simulador `scripts/qa/sunat-mock.cjs` permite probar la firma y el CDR sin enviar documentos reales a SUNAT. Nunca se configura ese simulador en producción.

## Actualización del VPS

Revisar primero este documento y el reporte de paridad. La actualización requiere una ventana sin pedidos mientras se detienen los escritores y se toman respaldos coherentes de las once bases.

```bash
cd /opt/restoapp
git pull --ff-only origin main
bash scripts/vps/update-saas-v2.sh --plan
```

Para aplicar el plan revisado:

```bash
bash scripts/vps/update-saas-v2.sh --apply /opt/restoapp/restoapp-vps-20261026
```

El script compila Linux AMD64, respalda las bases y adjuntos de compras, conserva `.env.vps` y las claves existentes, y genera `docker-compose.saas-v2.yml`. Arranca los servicios con sus migraciones y comprobaciones de salud; el gateway arranca al final. No modifica Agendly ni el Caddy compartido. En comandos futuros, el overlay SaaS v2 debe ir después de los overlays anteriores.

También se pueden preparar las imágenes en otro equipo, con el repositorio limpio y usando el mismo commit que tendrá el VPS:

```powershell
$revision = git rev-parse --short=12 HEAD
node scripts/vps/release.mjs --domain restoapp.mavricitas.com --tag "saas-v2-$revision" --build --save
```

El directorio generado contiene `images.tar`, `SHA256SUMS`, manifiesto y configuración. Transferirlo al VPS, verificar y cargar allí las imágenes. Con el repositorio en la revisión indicada por el manifiesto:

```bash
sha256sum -c SHA256SUMS
docker load -i images.tar
cd /opt/restoapp
bash scripts/vps/update-saas-v2.sh --apply /opt/restoapp/restoapp-vps-20261026 --use-loaded-images
```

Esta variante verifica la arquitectura y la revisión de las trece imágenes antes de detener servicios; realiza los mismos respaldos, migraciones y arranque que la compilación en VPS. Se actualiza el directorio de ejecución existente para conservar sus volúmenes y secretos; no se inicia otra instalación vacía con el Compose del paquete.

Si la versión anterior tiene cobros en cola, hay que procesarlos abriendo su turno antes de actualizar. El script comprueba esta condición antes de detener servicios. Los nuevos cobros del SaaS exigen un turno abierto y un documento elegido.

Si una migración o arranque falla, el script conserva los respaldos y deja detenido el gateway de RestoApp. No restaura automáticamente ni intenta ejecutar binarios antiguos sobre una base ya migrada. Revisar el error y el respaldo antes de recuperar el servicio.

La emisión tributaria real requiere los certificados y credenciales del emisor y el endpoint SUNAT correspondiente. Las pruebas locales con simulador no certifican aceptación de un comprobante real en producción.
