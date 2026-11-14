import type { PedidoVM, PedidoItemVM } from '../types/pedido.types';
import { ESTADOS_PRODUCCION } from './pedido.flow';

/** Each card is a portion of the same order, never a new commercial order. */
export function itemsEnEtapa(pedido: PedidoVM, etapa: string): PedidoItemVM[] {
  return pedido.items.filter((item) => (item.estado ?? pedido.estado) === etapa);
}

export function tieneEtapa(pedido: PedidoVM, etapa: string): boolean {
  if (!ESTADOS_PRODUCCION.has(pedido.estado)) return false;
  return pedido.items.length ? itemsEnEtapa(pedido, etapa).length > 0 : pedido.estado === etapa;
}

export function unidadesListas(pedido: PedidoVM): number {
  return pedido.items.filter((item) => item.estado === 'LISTO').reduce((n, item) => n + item.cantidad, 0);
}
