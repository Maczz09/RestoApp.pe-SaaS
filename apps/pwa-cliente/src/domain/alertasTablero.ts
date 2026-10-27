import type { PedidoVM } from '../types/pedido.types';

export const ETAPAS_SONORAS = ['PENDIENTE', 'EN_PREPARACION', 'LISTO'] as const;
export type EtapaSonora = (typeof ETAPAS_SONORAS)[number];
export type TableroSonoro = 'PEDIDOS' | 'COCINA';
export type SnapshotTablero = Map<string, EtapaSonora>;

const ETAPAS_SET = new Set<string>(ETAPAS_SONORAS);

function esEtapaSonora(estado: string): estado is EtapaSonora {
  return ETAPAS_SET.has(estado);
}

export function actualizacionSonoraDesdeEvento(data: unknown): { id: string; etapa: EtapaSonora } | null {
  if (!data || typeof data !== 'object') return null;
  const pedido = (data as { pedido?: unknown }).pedido;
  if (!pedido || typeof pedido !== 'object') return null;
  const { id, estado } = pedido as { id?: unknown; estado?: unknown };
  if (typeof id !== 'string' || typeof estado !== 'string' || !esEtapaSonora(estado)) return null;
  return { id, etapa: estado };
}

export function snapshotPedidos(pedidos: PedidoVM[]): SnapshotTablero {
  const snapshot: SnapshotTablero = new Map();
  pedidos.forEach((pedido) => {
    if (esEtapaSonora(pedido.estado)) snapshot.set(pedido.id, pedido.estado);
  });
  return snapshot;
}

export function snapshotCocina(pedidos: PedidoVM[]): SnapshotTablero {
  const snapshot: SnapshotTablero = new Map();
  pedidos.forEach((pedido) => pedido.items.forEach((item) => {
    if ((item.area === 'COCINA' || item.area === 'BAR') && esEtapaSonora(item.estado)) {
      snapshot.set(`${pedido.id}:${item.id}`, item.estado);
    }
  }));
  return snapshot;
}

export function snapshotTablero(tablero: TableroSonoro, pedidos: PedidoVM[]): SnapshotTablero {
  return tablero === 'COCINA' ? snapshotCocina(pedidos) : snapshotPedidos(pedidos);
}

export function etapasQueIngresan(anterior: SnapshotTablero, actual: SnapshotTablero): EtapaSonora[] {
  const entrantes = new Set<EtapaSonora>();
  actual.forEach((etapa, id) => {
    if (anterior.get(id) !== etapa) entrantes.add(etapa);
  });
  return ETAPAS_SONORAS.filter((etapa) => entrantes.has(etapa));
}
