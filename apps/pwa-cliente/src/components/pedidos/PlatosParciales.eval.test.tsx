// @vitest-environment jsdom
import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TableroView } from './TableroView';
import { ListaView } from './ListaView';
import { etapasQueIngresan, snapshotPedidos } from '../../domain/alertasTablero';
import type { PedidoVM, EstadoItem } from '../../types/pedido.types';

function pedido(estados: EstadoItem[] = ['LISTO', 'EN_PREPARACION']): PedidoVM {
  return {
    id: 'pedido-1', canal: 'SALON', mesaId: 'mesa-1', mesaNumero: '01', total: 66,
    estado: 'EN_PREPARACION', estadoLabel: 'En preparación', estadoClass: 'badge-info',
    cantidadItems: 3, createdAt: new Date().toISOString(),
    items: estados.map((estado, i) => ({
      id: `item-${i}`, productoId: `producto-${i}`, nombre: i ? 'Cabrito' : 'Arroz con pato',
      cantidad: i ? 1 : 2, precioUnitario: 22, subtotal: i ? 22 : 44, area: 'COCINA',
      notas: i ? 'Parte pierna' : 'Con pocas cremas', estado, estadoClass: 'badge-info', estadoLabel: estado,
    })),
  };
}
const props = { onAvanzar: vi.fn(), onDetalle: vi.fn(), actionLoading: null, online: true, now: Date.now() };

describe('Mesero sees dishes as kitchen completes them', () => {
  it('splits one order between preparation and pass with original details and notes', () => {
    const p = pedido();
    const { container } = render(<TableroView pedidos={[p]} {...props} />);
    const columns = container.querySelectorAll('.ped-col');
    expect(within(columns[1] as HTMLElement).getByText('Cabrito')).toBeInTheDocument();
    expect(within(columns[1] as HTMLElement).queryByText('Arroz con pato')).not.toBeInTheDocument();
    expect(within(columns[2] as HTMLElement).getByText('Arroz con pato')).toBeInTheDocument();
    expect(within(columns[2] as HTMLElement).getByText('Con pocas cremas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Entregar pedido/ })).not.toBeInTheDocument();
    fireEvent.click(within(columns[2] as HTMLElement).getByRole('button', { name: /Ver detalle/ }));
    expect(props.onDetalle).toHaveBeenCalledWith(p);
  });

  it('moves a reverted dish back and never duplicates it in the ready column', () => {
    const { rerender, container } = render(<TableroView pedidos={[pedido()]} {...props} />);
    rerender(<TableroView pedidos={[pedido(['EN_PREPARACION', 'EN_PREPARACION'])]} {...props} />);
    expect(within(container.querySelectorAll('.ped-col')[2] as HTMLElement).queryByText('Arroz con pato')).not.toBeInTheDocument();
    expect(screen.getAllByText('Arroz con pato')).toHaveLength(1);
  });

  it('list view exposes ready units while keeping the complete order state', () => {
    render(<ListaView pedidos={[pedido()]} {...props} />);
    expect(screen.getByText('2 platos listos para recoger')).toBeInTheDocument();
    expect(screen.getByText('En preparación')).toBeInTheDocument();
  });

  it('sounds once when each dish becomes ready despite unchanged order state', () => {
    const before = snapshotPedidos([pedido(['EN_PREPARACION', 'EN_PREPARACION'])]);
    const first = snapshotPedidos([pedido()]);
    const second = snapshotPedidos([pedido(['LISTO', 'LISTO'])]);
    expect(etapasQueIngresan(before, first)).toEqual(['LISTO']);
    expect(etapasQueIngresan(first, first)).toEqual([]);
    expect(etapasQueIngresan(first, second)).toEqual(['LISTO']);
  });

  it('ignores cancelled dishes and completed orders', () => {
    render(<TableroView pedidos={[{ ...pedido(), estado: 'ENTREGADO' }, { ...pedido(['CANCELADO', 'RECHAZADO_SIN_STOCK']), id: 'cancelled' }]} {...props} />);
    expect(screen.queryByText('Cabrito')).not.toBeInTheDocument();
  });
});
