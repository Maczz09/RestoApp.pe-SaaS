/** Amounts at the persistence boundary are integer cents. */
export interface UnidadDivision {
  key: string;
  itemId: string;
  indiceUnidad: number;
  productoId: string;
  nombre: string;
  notas: string;
  centimos: number;
}

export interface ItemFiscalDivision {
  productoId: string;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  notas: string;
}

export interface ConfigDivisionCuenta {
  modo: 'PARTES' | 'ITEMS';
  numPartes: number;
  asignaciones?: Record<string, number>;
  descuento: number;
  propina: number;
  version?: number;
}

export interface ParteDivisionCuenta {
  id: string;
  indice: number;
  label: string;
  monto: number;
  tip: number;
  unidades: UnidadDivision[];
  items: ItemFiscalDivision[];
  pagada: boolean;
  transaccionIds: string[];
}

export interface DivisionCuentaDto {
  id: string;
  cuentaId: string;
  version: number;
  modo: 'PARTES' | 'ITEMS';
  numPartes: number;
  asignaciones: Record<string, number>;
  descuento: number;
  propina: number;
  total: number;
  partes: ParteDivisionCuenta[];
}

export interface PedidoDivisionSnapshot {
  id?: string;
  estado?: string;
  items: Array<{ id?: string; productoId: string; nombre: string; notas?: string; cantidad: number; subtotal?: number; precioUnitario?: number; estado?: string }>;
}

export function centimosDivision(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 10_000_000) throw new Error('Monto inválido');
  return Math.round((value + Number.EPSILON) * 100);
}

export function repartirCentimos(total: number, pesos: number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0 || !pesos.length || pesos.some(p => !Number.isFinite(p) || p < 0)) throw new Error('Distribución inválida');
  const suma = pesos.reduce((a, b) => a + b, 0);
  if (suma === 0) return pesos.map(() => 0);
  const resultado = pesos.map(p => Math.floor(total * p / suma));
  let pendiente = total - resultado.reduce((a, b) => a + b, 0);
  // Deterministic largest-remainder distribution, stable on equal weights.
  const orden = pesos.map((p, i) => ({ i, resto: total * p / suma - resultado[i] })).sort((a, b) => b.resto - a.resto || b.i - a.i);
  for (let j = 0; pendiente > 0; j++, pendiente--) resultado[orden[j % orden.length].i]++;
  return resultado;
}

export function unidadesDivision(pedidos: PedidoDivisionSnapshot[]): UnidadDivision[] {
  const unidades: UnidadDivision[] = [];
  for (const pedido of pedidos) {
    if (pedido.estado === 'CANCELADO' || pedido.estado === 'RECHAZADO_SIN_STOCK') continue;
    for (const [itemIndex, item] of pedido.items.entries()) {
      if (item.estado === 'CANCELADO' || item.estado === 'RECHAZADO_SIN_STOCK') continue;
      if (!Number.isInteger(item.cantidad) || item.cantidad < 1 || item.cantidad > 1000) throw new Error('Línea de pedido inválida');
      const itemId = item.id ?? `${pedido.id ?? 'pedido'}:${item.productoId}:${itemIndex}`;
      const precios = repartirCentimos(centimosDivision(item.subtotal ?? (item.precioUnitario ?? Number.NaN) * item.cantidad), Array.from({ length: item.cantidad }, () => 1));
      precios.forEach((centimos, indiceUnidad) => unidades.push({ key: `${itemId}:${indiceUnidad}`, itemId, indiceUnidad, productoId: item.productoId, nombre: item.nombre, notas: item.notas ?? '', centimos }));
    }
  }
  if (new Set(unidades.map(u => u.key)).size !== unidades.length) throw new Error('Identificadores de plato duplicados');
  return unidades;
}

/** Server and browser use the same cent-accurate partition. Prices come from the server snapshot. */
export function calcularDivision(total: number, pedidos: PedidoDivisionSnapshot[], config: ConfigDivisionCuenta): Omit<ParteDivisionCuenta, 'id' | 'pagada' | 'transaccionIds'>[] {
  if (!['PARTES', 'ITEMS'].includes(config.modo) || !Number.isInteger(config.numPartes) || config.numPartes < 2 || config.numPartes > 50) throw new Error('Divide la cuenta entre 2 y 50 partes');
  const bruto = centimosDivision(total), descuento = centimosDivision(config.descuento), propina = centimosDivision(config.propina);
  if (descuento >= bruto) throw new Error('La división requiere un saldo positivo');
  const unidades = unidadesDivision(pedidos);
  if (!unidades.length || unidades.reduce((s, u) => s + u.centimos, 0) !== bruto) throw new Error('El detalle de la cuenta cambió; actualiza antes de dividir');
  const netos = repartirCentimos(bruto - descuento, unidades.map(u => u.centimos));
  const grupos: UnidadDivision[][] = Array.from({ length: config.numPartes }, () => []);
  if (config.modo === 'ITEMS') {
    const asignaciones = config.asignaciones ?? {};
    if (Object.keys(asignaciones).some(key => !unidades.some(u => u.key === key))) throw new Error('Hay platos ajenos o eliminados en la división');
    for (const unidad of unidades) {
      const comensal = asignaciones[unidad.key];
      if (!Number.isInteger(comensal) || comensal < 1 || comensal > config.numPartes) throw new Error('Asigna cada unidad a un comensal');
      grupos[comensal - 1].push(unidad);
    }
  }
  const montos = config.modo === 'PARTES' ? repartirCentimos(bruto - descuento, grupos.map(() => 1)) : grupos.map(g => g.reduce((s, u) => s + netos[unidades.indexOf(u)], 0));
  const tips = repartirCentimos(propina, montos);
  const result: Omit<ParteDivisionCuenta, 'id' | 'pagada' | 'transaccionIds'>[] = [];
  let unidadIndex = 0, quedaUnidad = netos[0] ?? 0;
  for (let i = 0; i < grupos.length; i++) {
    if (montos[i] <= 0) continue;
    const fiscal: ItemFiscalDivision[] = [];
    if (config.modo === 'ITEMS') {
      grupos[i].forEach(u => {
        const valor = netos[unidades.indexOf(u)];
        if (valor) fiscal.push({ productoId: u.productoId, nombre: u.nombre, notas: u.notas, cantidad: 1, precioUnitario: valor / 100 });
      });
    } else {
      let quedaParte = montos[i];
      while (quedaParte > 0 && unidadIndex < unidades.length) {
        if (!quedaUnidad) { unidadIndex++; quedaUnidad = netos[unidadIndex] ?? 0; continue; }
        const tomar = Math.min(quedaUnidad, quedaParte), u = unidades[unidadIndex];
        fiscal.push({ productoId: u.productoId, nombre: tomar === netos[unidadIndex] ? u.nombre : `${u.nombre} (consumo parcial)`, notas: u.notas, cantidad: 1, precioUnitario: tomar / 100 });
        quedaUnidad -= tomar; quedaParte -= tomar;
      }
    }
    result.push({ indice: i, label: config.modo === 'PARTES' ? `Parte ${i + 1} de ${config.numPartes}` : `Comensal ${i + 1}`, monto: montos[i] / 100, tip: tips[i] / 100, unidades: config.modo === 'ITEMS' ? grupos[i] : [], items: fiscal });
  }
  return result;
}
