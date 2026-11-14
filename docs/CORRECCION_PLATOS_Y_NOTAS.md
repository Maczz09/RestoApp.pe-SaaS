# Platos listos y notas por unidad

Pedidos agrupaba las tarjetas por el estado global: un pedido EN_PREPARACION no
aparecía en Listos aunque alguno de sus platos ya estaba LISTO. Cocina sí emitía
pedido.actualizado para cada cambio; la caché se invalida por ese evento.

Ahora el tablero muestra cada línea en su etapa de producción, con su nota,
sin ocultar platos después de las primeras tres líneas. Un pedido puede tener
una tarjeta en preparación y otra en pase. Ambas abren el pedido completo; el
total sigue siendo el del pedido, no se duplica el cobro. El botón de entregar
el pedido completo sigue disponible cuando todo está listo. Lista muestra cuántas
unidades están listas para recoger. Sonido detecta cada nuevo plato listo aunque
no cambie el estado global, usando los datos refrescados por el socket, evitando
el doble aviso por el evento y su refetch.

En el carrito, aumentar cantidad prepara notas independientes por unidad.
«Notas por unidad» permite editarlas. Se envían líneas cantidad=1 para preservar
nota y avance individual en cocina; cantidades, precios y total no cambian.
Esto se aplica a nuevos pedidos: líneas agrupadas ya enviadas no se dividen ni
se modifican retroactivamente. Pedidos y KDS conservan las notas de cada línea.
No se añadió un servicio de impresión de cocina; no existe en este checkout.

## Actualizar la instalación existente

El script ya preparado también conserva la corrección anterior de usuarios:

```bash
cd /opt/restoapp
git pull --ff-only origin main
bash scripts/vps/update-team-access.sh
```

Construye identidad y PWA, respalda identidad y recrea esos dos servicios. Conservar
los tres archivos Compose documentados en CORRECCION_USUARIOS_SAAS.md para futuras
operaciones. No se requiere una migración nueva para notas ni estados por plato.

Verificación manual: crear dos cabritos; abrir Notas por unidad; escribir «parte
pierna» en Unidad 1 y «sin ají» en Unidad 2. Enviar, marcar solo uno listo desde
cocina y comprobar que el mesero ve una línea en pase y la otra en preparación,
conservando sus notas. Revertir uno y verificar que vuelve a preparación.

Regresiones automatizadas: tablero parcial, reversión, lista, sonido sin cambio
global, terminales/cancelados; carrito, payload, cantidades y notas independientes;
KDS con productos repetidos y notas distintas. Los contenedores de producción
requieren reconstrucción en el VPS: no se han actualizado remotamente.
