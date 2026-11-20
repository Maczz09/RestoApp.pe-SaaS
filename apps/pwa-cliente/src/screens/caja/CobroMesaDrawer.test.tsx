// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CobroMesaDrawer, construirTramosPago } from './CobroMesaDrawer';
import { useCuentasQuery } from '../../hooks/queries/useCuentasQuery';
import { useSedeActualQuery } from '../../hooks/queries/useSedesQuery';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useToast } from '../../components/ui/ToastProvider';
import { useDivisionCuenta } from '../../hooks/queries/useDivisionCuenta';
import { calcularDivision } from '../../domain/divisionCuenta';
import type { ConfigDivisionCuenta, DivisionCuentaDto } from '@org/contracts';

vi.mock('../../hooks/queries/useDivisionCuenta', () => ({ useDivisionCuenta: vi.fn() }));
let storedDivision: DivisionCuentaDto | null = null;
const guardarDivision = vi.fn();
const invalidarDivision = vi.fn();
const ampliarDivision = vi.fn();
const eliminarDivision = vi.fn();
const elegirTicket = () => fireEvent.click(screen.getByRole('button', { name: 'Ticket interno' }));

vi.mock('../../hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn()
}));

vi.mock('../../hooks/queries/useCuentasQuery', () => ({
  useCuentasQuery: vi.fn()
}));

vi.mock('../../hooks/queries/useSedesQuery', () => ({
  useSedeActualQuery: vi.fn()
}));

vi.mock('../../components/ui/ToastProvider', () => ({
  useToast: vi.fn()
}));

vi.mock('../../utils/ticketPrint', () => ({
  abrirTicketParaImprimir: vi.fn()
}));

vi.mock('../../components/ui/Scrim', () => ({
  Scrim: ({ onClose }: { onClose: () => void }) => <div data-testid="scrim" onClick={onClose}></div>
}));

vi.mock('../../components/ui/icons', () => ({
  Icons: {
    Close: () => <svg data-testid="icon-close" />,
    Cash: () => <svg data-testid="icon-cash" />,
    Card: () => <svg data-testid="icon-card" />,
    Wallet: () => <svg data-testid="icon-wallet" />,
    Coins: () => <svg data-testid="icon-coins" />,
    Alert: () => <svg data-testid="icon-alert" />,
    Check: () => <svg data-testid="icon-check" />,
    Print: () => <svg data-testid="icon-print" />,
    Clock: () => <svg data-testid="icon-clock" />
  }
}));

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: vi.fn()
}));

const mockCuenta = {
  id: 'cuenta1',
  mesaId: 'mesa1',
  estado: 'ABIERTA',
  total: 100,
  cantidadItems: 2,
  pedidos: [
    {
      id: 'ped1',
      items: [
        { id: 'it1', productoId: 'prod1', nombre: 'Plato 1', cantidad: 1, precioUnitario: 60, subtotal: 60 },
        { id: 'it2', productoId: 'prod2', nombre: 'Plato 2', cantidad: 1, precioUnitario: 40, subtotal: 40 }
      ]
    }
  ]
};

describe('construirTramosPago', () => {
  it('cuadra base y propina por método sin perder céntimos', () => {
    const tramos = construirTramosPago({
      EFECTIVO: '40', TARJETA: '35.55', YAPE: '30', PLIN: '', TRANSFERENCIA: '',
    }, 100.55, 5);
    expect(tramos.map((tramo) => tramo.metodo)).toEqual(['EFECTIVO', 'TARJETA', 'YAPE']);
    expect(tramos.reduce((suma, tramo) => suma + tramo.total, 0)).toBeCloseTo(105.55, 2);
    expect(tramos.reduce((suma, tramo) => suma + tramo.monto, 0)).toBeCloseTo(100.55, 2);
    expect(tramos.reduce((suma, tramo) => suma + tramo.propina, 0)).toBeCloseTo(5, 2);
  });

  it('rechaza una distribución que no coincide con el total', () => {
    expect(construirTramosPago({
      EFECTIVO: '40', TARJETA: '30', YAPE: '', PLIN: '', TRANSFERENCIA: '',
    }, 100, 0)).toEqual([]);
  });

  it('exige dos métodos reales y no deja que la propina absorba un tramo', () => {
    expect(construirTramosPago({
      EFECTIVO: '100', TARJETA: '', YAPE: '', PLIN: '', TRANSFERENCIA: '',
    }, 100, 0)).toEqual([]);
    expect(construirTramosPago({
      EFECTIVO: '50', TARJETA: '50.01', YAPE: '', PLIN: '', TRANSFERENCIA: '',
    }, 0.01, 100)).toEqual([]);
  });
});

describe('CobroMesaDrawer', () => {
  beforeEach(() => {
    storedDivision = null;
    guardarDivision.mockReset();
    invalidarDivision.mockReset();
    ampliarDivision.mockReset().mockResolvedValue(undefined);
    eliminarDivision.mockReset().mockResolvedValue(undefined);
    guardarDivision.mockImplementation(async (config: ConfigDivisionCuenta) => {
      storedDivision = { ...config, asignaciones: config.asignaciones ?? {}, id: 'plan-1', cuentaId: mockCuenta.id, version: (storedDivision?.version ?? 0) + 1, total: mockCuenta.total,
        partes: calcularDivision(mockCuenta.total, mockCuenta.pedidos, config).map((p, i) => ({ ...p, id: 'parte-' + i, pagada: false, transaccionIds: [] })) };
      return storedDivision;
    });
    invalidarDivision.mockImplementation(async () => {
      if (storedDivision) {
        const index = storedDivision.partes.findIndex(p => !p.pagada);
        storedDivision = { ...storedDivision, partes: storedDivision.partes.map((p, i) => i === index ? { ...p, pagada: true, transaccionIds: ['tx' + i] } : p) };
      }
    });
    vi.mocked(useDivisionCuenta).mockImplementation(() => ({ division: storedDivision, loading: false, saving: false, error: null, guardar: guardarDivision, invalidar: invalidarDivision, ampliar: ampliarDivision, eliminar: eliminarDivision, refetch: vi.fn() }) as any);
    vi.mocked(useOnlineStatus).mockReturnValue(true);
    vi.mocked(useToast).mockReturnValue({ toast: vi.fn() } as any);
    vi.mocked(useSedeActualQuery).mockReturnValue({ sede: null, loading: false } as any);
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: mockCuenta,
      loading: false,
      error: null,
      success: null,
      registrarPago: vi.fn(),
      clearFeedback: vi.fn(),
      refetchCuenta: vi.fn()
    } as any);
  });

  it('requires an explicit document choice before any payment', () => {
    const registrarPago = vi.fn();
    vi.mocked(useCuentasQuery).mockReturnValue({ cuentaActiva: mockCuenta, loading: false, registrarPago, clearFeedback: vi.fn() } as any);
    render(<CobroMesaDrawer mesaId="mesa1" onClose={vi.fn()} />);
    const pagar = screen.getByRole('button', { name: /Registrar pago y cerrar cuenta/ });
    expect(pagar).toBeDisabled();
    fireEvent.click(pagar);
    expect(registrarPago).not.toHaveBeenCalled();
    elegirTicket();
    expect(pagar).not.toBeDisabled();
  });

  it('restores paid portions after reopening and never resaves their assignments', async () => {
    await guardarDivision({ modo: 'PARTES', numPartes: 2, descuento: 0, propina: 0 });
    storedDivision = { ...storedDivision!, partes: storedDivision!.partes.map((p, i) => ({ ...p, pagada: i === 0 })) };
    guardarDivision.mockClear();
    const registrarPago = vi.fn().mockResolvedValue({ pendiente: 0 });
    vi.mocked(useCuentasQuery).mockReturnValue({ cuentaActiva: mockCuenta, loading: false, registrarPago, clearFeedback: vi.fn() } as any);
    render(<CobroMesaDrawer mesaId="mesa1" mesaNumero="12" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Por plato' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Partes iguales' })).toBeDisabled();
    elegirTicket();
    fireEvent.click(screen.getByRole('button', { name: /Registrar pago y cerrar cuenta/ }));
    await waitFor(() => expect(registrarPago).toHaveBeenCalledWith(expect.objectContaining({ montoRecibido: 50, divisionPlanId: 'plan-1', divisionParteId: 'parte-1', divisionVersion: 1 })));
    expect(guardarDivision).not.toHaveBeenCalled();
  });

  it('extends a saved division after new consumption without resaving paid portions', async () => {
    await guardarDivision({modo:'PARTES',numPartes:2,descuento:0,propina:0});
    storedDivision = {...storedDivision!, partes:storedDivision!.partes.map((p,i)=>({...p,pagada:i===0}))};
    guardarDivision.mockClear();
    vi.mocked(useCuentasQuery).mockReturnValue({cuentaActiva:{...mockCuenta,total:130,pedidos:[...mockCuenta.pedidos,{id:'new',items:[{id:'extra',nombre:'Extra',productoId:'extra',cantidad:1,precioUnitario:30,subtotal:30}]}]},loading:false,registrarPago:vi.fn(),clearFeedback:vi.fn()} as any);
    render(<CobroMesaDrawer mesaId="mesa1" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button',{name:'Actualizar división'}));
    await waitFor(()=>expect(ampliarDivision).toHaveBeenCalledWith(1));
    expect(guardarDivision).not.toHaveBeenCalled();
    expect(eliminarDivision).not.toHaveBeenCalled();
  });

  it('chooses the first unpaid portion even when paid portions are not a prefix', async () => {
    await guardarDivision({ modo: 'PARTES', numPartes: 3, descuento: 0, propina: 0 });
    storedDivision = { ...storedDivision!, partes: storedDivision!.partes.map((p, i) => ({ ...p, pagada: i === 1 })) };
    const registrarPago = vi.fn().mockResolvedValue({ pendiente: 33.34 });
    vi.mocked(useCuentasQuery).mockReturnValue({ cuentaActiva: mockCuenta, loading: false, registrarPago, clearFeedback: vi.fn() } as any);
    render(<CobroMesaDrawer mesaId="mesa1" mesaNumero="12" onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Cobrar parte 1 de 3/ })).toBeVisible());
    elegirTicket();
    fireEvent.click(screen.getByRole('button', { name: /Cobrar parte 1 de 3/ }));
    await waitFor(() => expect(registrarPago).toHaveBeenCalledWith(expect.objectContaining({ montoRecibido: 33.33, divisionParteId: 'parte-0' })));
  });

  it('assigns quantity units independently and saves the resulting unit keys', async () => {
    const cuenta = { ...mockCuenta, total: 60, pedidos: [{ id: 'p', items: [{ id: 'cabrito', productoId: 'prod', nombre: 'Cabrito', cantidad: 2, precioUnitario: 30, subtotal: 60, notas: 'Sin ají' }] }] };
    guardarDivision.mockImplementation(async (config: ConfigDivisionCuenta) => ({ ...config, asignaciones: config.asignaciones ?? {}, id: 'plan-1', cuentaId: 'cuenta1', version: 1, total: 60, partes: calcularDivision(60, cuenta.pedidos, config).map((p, i) => ({ ...p, id: 'parte-' + i, pagada: false, transaccionIds: [] })) }));
    const registrarPago = vi.fn().mockResolvedValue({ pendiente: 30 });
    vi.mocked(useCuentasQuery).mockReturnValue({ cuentaActiva: cuenta, loading: false, registrarPago, clearFeedback: vi.fn() } as any);
    render(<CobroMesaDrawer mesaId="mesa1" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Por plato' }));
    expect(screen.getByText('Cabrito · unidad 1')).toBeVisible();
    expect(screen.getByText('Cabrito · unidad 2')).toBeVisible();
    fireEvent.click(screen.getAllByRole('button', { name: 'C2' })[1]);
    elegirTicket();
    fireEvent.click(screen.getByRole('button', { name: /Cobrar comensal 1/ }));
    await waitFor(() => expect(guardarDivision).toHaveBeenCalledWith(expect.objectContaining({ modo: 'ITEMS', asignaciones: { 'cabrito:0': 1, 'cabrito:1': 2 } })));
    expect(registrarPago).toHaveBeenCalledWith(expect.objectContaining({ montoRecibido: 30, divisionParteId: 'parte-0' }));
  });

  it('excluye ítems anulados y pedidos cancelados del detalle de cobro (bug: aparecían en la boleta)', async () => {
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: {
        ...mockCuenta,
        pedidos: [
          {
            id: 'ped1',
            estado: 'PENDIENTE',
            items: [
              { id: 'it1', nombre: 'Plato 1', cantidad: 1, subtotal: 60, estado: 'PENDIENTE' },
              { id: 'it2', nombre: 'Plato 2 anulado', cantidad: 1, subtotal: 40, estado: 'CANCELADO' }
            ]
          },
          {
            id: 'ped-viejo',
            estado: 'CANCELADO',
            items: [
              { id: 'it3', nombre: 'Ronda anterior cancelada', cantidad: 1, subtotal: 35, estado: 'CANCELADO' }
            ]
          }
        ]
      },
      loading: false,
      error: null,
      success: null,
      registrarPago: vi.fn(),
      clearFeedback: vi.fn()
    } as any);

    render(<CobroMesaDrawer mesaId="mesa1" mesaNumero="12" onClose={vi.fn()} />);

    expect(screen.getByText('Plato 1')).toBeDefined();
    expect(screen.queryByText('Plato 2 anulado')).toBeNull();
    expect(screen.queryByText('Ronda anterior cancelada')).toBeNull();
  });

  it('renders and handles exact cash payment', async () => {
    const registrarPago = vi.fn();
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: mockCuenta,
      loading: false,
      error: null,
      success: null,
      registrarPago,
      clearFeedback: vi.fn()
    } as any);

    const onClose = vi.fn();
    const onPaid = vi.fn();

    render(<CobroMesaDrawer mesaId="mesa1" mesaNumero="12" onClose={onClose} onPaid={onPaid} />);

    expect(screen.getByText('Plato 1')).toBeDefined();

    // Descuento
    // The inputs are inputs without labels, we can find them by order or value
    // The first is Descuento, the second is Propina, the third is Recibido
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: '10' } });
    fireEvent.change(inputs[1], { target: { value: '5' } });

    // Keypad C
    const recibidoInput = screen.getByLabelText(/Recibido en efectivo/) as HTMLInputElement;
    fireEvent.click(screen.getByText('C'));

    // Keypad 100
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    fireEvent.click(screen.getByRole('button', { name: '0' }));
    fireEvent.click(screen.getByRole('button', { name: '0' }));

    expect(recibidoInput.value).toBe('100');

    // Pay
    elegirTicket();
    fireEvent.click(screen.getByRole('button', { name: /Registrar pago y cerrar cuenta/i }));

    await waitFor(() => {
      expect(registrarPago).toHaveBeenCalledWith({
        cuentaId: 'cuenta1',
        montoRecibido: 90, // totalBase
        metodo: 'EFECTIVO',
        descuento: 10,
        propina: 5,
        mesaNumero: '12',
        tipoComprobante: 'TICKET',
        documentoV2: true
      });
      expect(onPaid).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('combina dos métodos y registra cada tramo en la cascada de caja', async () => {
    const registrarPago = vi.fn();
    const registrarPagoCombinado = vi.fn().mockResolvedValue({
      pendiente: 0,
      transaccion: { id: 'tx-2', metodo: 'TARJETA' },
      transacciones: [{ id: 'tx-1', metodo: 'EFECTIVO' }, { id: 'tx-2', metodo: 'TARJETA' }],
    });
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: mockCuenta, loading: false, error: null, success: null,
      registrarPago, registrarPagoCombinado, clearFeedback: vi.fn(), refetchCuenta: vi.fn(),
    } as any);
    const onClose = vi.fn();

    render(<CobroMesaDrawer mesaId="mesa1" mesaNumero="12" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Combinar métodos' }));
    fireEvent.change(screen.getByLabelText('Monto Efectivo'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Monto Tarjeta'), { target: { value: '60' } });
    elegirTicket();
    fireEvent.click(screen.getByRole('button', { name: /Registrar pago y cerrar cuenta/i }));

    await waitFor(() => expect(registrarPagoCombinado).toHaveBeenCalledTimes(1));
    expect(registrarPagoCombinado).toHaveBeenCalledWith(expect.objectContaining({
      cuentaId: 'cuenta1',
      pagos: [
        { metodo: 'EFECTIVO', monto: 40, propina: 0 },
        { metodo: 'TARJETA', monto: 60, propina: 0 },
      ],
      notas: 'Pago combinado · EFECTIVO + TARJETA',
    }));
    expect(registrarPago).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('muestra la boleta interna imprimible cuando el pago devuelve un ticket, en vez de cerrar de una', async () => {
    const registrarPago = vi.fn().mockResolvedValue({
      transaccion: { id: 'tx1', cuentaId: 'cuenta1', monto: 100, metodo: 'EFECTIVO', cajeroNombre: 'Ana' },
      ticket: {
        id: 'ticket-001', cuentaId: 'cuenta1', mesaId: 'mesa1',
        items: [{ nombre: 'Plato 1', cantidad: 1, precioUnitario: 60 }, { nombre: 'Plato 2', cantidad: 1, precioUnitario: 40 }],
        subtotal: 100, descuento: 0, total: 100, fecha: '2026-08-08T20:00:00.000Z',
      },
    });
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: mockCuenta, loading: false, error: null, success: null,
      registrarPago, clearFeedback: vi.fn(),
    } as any);
    const onClose = vi.fn();
    const onPaid = vi.fn();

    render(<CobroMesaDrawer mesaId="mesa1" mesaNumero="12" onClose={onClose} onPaid={onPaid} />);
    elegirTicket();
    fireEvent.click(screen.getByRole('button', { name: /Registrar pago y cerrar cuenta/i }));

    await waitFor(() => {
      expect(screen.getByText('Ticket interno')).toBeInTheDocument();
    });
    expect(onPaid).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled(); // no cierra hasta que el usuario confirme

    // Imprimir abre la boleta en una pestaña dedicada (utils/ticketPrint.ts),
    // no imprime encima del modal — ver BoletaInterna.test.tsx para el detalle.
    fireEvent.click(screen.getByRole('button', { name: /Imprimir ticket/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('si la caja está cerrada, el pago queda en cola: avisa y cierra sin intentar mostrar boleta', async () => {
    const registrarPago = vi.fn().mockResolvedValue({ queued: true, pendiente: 90 });
    const toast = vi.fn();
    vi.mocked(useToast).mockReturnValue({ toast } as any);
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: mockCuenta, loading: false, error: null, success: null,
      registrarPago, clearFeedback: vi.fn(),
    } as any);
    const onClose = vi.fn();
    const onPaid = vi.fn();

    render(<CobroMesaDrawer mesaId="mesa1" mesaNumero="12" onClose={onClose} onPaid={onPaid} />);
    elegirTicket();
    fireEvent.click(screen.getByRole('button', { name: /Registrar pago y cerrar cuenta/i }));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Caja cerrada: pago en espera', kind: 'warn' }));
      expect(onPaid).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
    expect(screen.queryByText('Boleta de venta')).not.toBeInTheDocument();
  });

  it('handles other payment methods and insufficient payment', () => {
    render(<CobroMesaDrawer mesaId="mesa1" onClose={vi.fn()} />);

    // Change method to Yape
    fireEvent.click(screen.getByText('Yape'));

    // Keypad is not there for Yape
    expect(screen.queryByText(/Recibido en efectivo/)).toBeNull();

    // Change back to Efectivo
    fireEvent.click(screen.getByText('Efectivo'));

    const input = screen.getByLabelText(/Recibido en efectivo/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '50' } }); // 50 < 100 total

    expect(screen.getByText(/El monto recibido es menor al total./i)).toBeDefined();

    const payBtn = screen.getByRole('button', { name: /Registrar pago y cerrar cuenta/i });
    expect(payBtn.hasAttribute('disabled')).toBe(true);

    // Exact button
    fireEvent.click(screen.getByText('Exacto'));
    expect(input.value).toBe('100.00');

    // S/ 200 button
    fireEvent.click(screen.getByText('S/ 200'));
    expect(input.value).toBe('200');
  });

  it('handles loading, offline and empty states', () => {
    vi.mocked(useOnlineStatus).mockReturnValue(false);
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: null,
      loading: true,
      error: null,
      success: null,
      registrarPago: vi.fn(),
      clearFeedback: vi.fn()
    } as any);

    const { rerender } = render(<CobroMesaDrawer mesaId="mesa1" onClose={vi.fn()} />);

    expect(screen.getByText('Cargando cuenta…')).toBeDefined();

    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: null,
      loading: false,
      error: null,
      success: null,
      registrarPago: vi.fn(),
      clearFeedback: vi.fn()
    } as any);
    rerender(<CobroMesaDrawer mesaId="mesa1" onClose={vi.fn()} />);

    expect(screen.getByText('Sin cuenta abierta')).toBeDefined();

    // With cuenta but offline
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: mockCuenta,
      loading: false,
      error: null,
      success: null,
      registrarPago: vi.fn(),
      clearFeedback: vi.fn()
    } as any);
    rerender(<CobroMesaDrawer mesaId="mesa1" onClose={vi.fn()} />);

    expect(screen.getByText('Sin conexión. Reconecta para registrar el pago.')).toBeDefined();
  });

  it('shows error and success messages, with retry when the cuenta failed to load', () => {
    const clearFeedback = vi.fn();
    const refetchCuenta = vi.fn();
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: mockCuenta,
      loading: false,
      error: 'Error mock',
      queryError: true,
      success: 'Success mock',
      registrarPago: vi.fn(),
      clearFeedback,
      refetchCuenta
    } as any);

    render(<CobroMesaDrawer mesaId="mesa1" onClose={vi.fn()} />);

    expect(screen.getByText('Error mock')).toBeDefined();
    // T-04: con error de carga de la cuenta, "Reintentar" dispara refetchCuenta.
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar carga de la cuenta' }));
    expect(refetchCuenta).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar notificación' }));
    expect(clearFeedback).toHaveBeenCalled();
  });

  it('hides "Reintentar" when the error comes from a mutation (e.g. pagar), not from loading the cuenta', () => {
    const refetchCuenta = vi.fn();
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: mockCuenta,
      loading: false,
      error: 'No se pudo registrar el pago',
      queryError: false,
      success: null,
      registrarPago: vi.fn(),
      clearFeedback: vi.fn(),
      refetchCuenta
    } as any);

    render(<CobroMesaDrawer mesaId="mesa1" onClose={vi.fn()} />);

    expect(screen.getByText('No se pudo registrar el pago')).toBeDefined();
    // Refetch de la cuenta no reintenta un pago fallido: el botón no debe existir.
    expect(screen.queryByRole('button', { name: 'Reintentar carga de la cuenta' })).toBeNull();
    expect(refetchCuenta).not.toHaveBeenCalled();
  });

  it('handles empty items array', () => {
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: { ...mockCuenta, pedidos: [] },
      loading: false,
      error: null,
      success: null,
      registrarPago: vi.fn(),
      clearFeedback: vi.fn()
    } as any);
    render(<CobroMesaDrawer mesaId="mesa1" onClose={vi.fn()} />);
    expect(screen.getByText('La cuenta no tiene ítems.')).toBeDefined();
  });

  it('T-16: divide la cuenta en partes iguales y cobra cada parte por separado', async () => {
    const registrarPago = vi.fn()
      .mockResolvedValueOnce({ transaccion: { id: 'tx1' }, pendiente: 50 })
      .mockResolvedValueOnce({ transaccion: { id: 'tx2' }, pendiente: 0 });
    const onClose = vi.fn();
    const onPaid = vi.fn();
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: mockCuenta, loading: false, error: null, success: null,
      registrarPago, clearFeedback: vi.fn(),
    } as any);

    render(<CobroMesaDrawer mesaId="mesa1" mesaNumero="12" onClose={onClose} onPaid={onPaid} />);

    fireEvent.click(screen.getByRole('button', { name: 'Partes iguales' }));

    elegirTicket();
    const cobrarParte1 = screen.getByRole('button', { name: /Cobrar parte 1 de 2/i });
    fireEvent.click(cobrarParte1);

    await waitFor(() => {
      expect(registrarPago).toHaveBeenNthCalledWith(1, {
        cuentaId: 'cuenta1',
        montoRecibido: 50,
        divisionPlanId: 'plan-1', divisionParteId: 'parte-0', divisionVersion: 1,
        metodo: 'EFECTIVO',
        descuento: 0,
        propina: 0,
        mesaNumero: '12',
        tipoComprobante: 'TICKET',
        documentoV2: true,
      });
    });
    // Pago parcial: no cierra el drawer todavía, pasa a la parte 2.
    expect(onClose).not.toHaveBeenCalled();
    expect(onPaid).not.toHaveBeenCalled();

    const cobrarParte2 = await screen.findByRole('button', { name: /Registrar pago y cerrar cuenta/i });
    elegirTicket();
    await waitFor(() => expect(cobrarParte2).not.toBeDisabled());
    fireEvent.click(cobrarParte2);

    await waitFor(() => {
      expect(registrarPago).toHaveBeenNthCalledWith(2, {
        cuentaId: 'cuenta1',
        montoRecibido: 50,
        divisionPlanId: 'plan-1', divisionParteId: 'parte-1', divisionVersion: 1,
        metodo: 'EFECTIVO',
        descuento: 0,
        propina: 0,
        mesaNumero: '12',
        tipoComprobante: 'TICKET',
        documentoV2: true,
      });
      expect(onPaid).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('T-16: divide la cuenta por plato asignando cada ítem a un comensal', async () => {
    const registrarPago = vi.fn()
      .mockResolvedValueOnce({ transaccion: { id: 'tx1' }, pendiente: 40 })
      .mockResolvedValueOnce({ transaccion: { id: 'tx2' }, pendiente: 0 });
    vi.mocked(useCuentasQuery).mockReturnValue({
      cuentaActiva: mockCuenta, loading: false, error: null, success: null,
      registrarPago, clearFeedback: vi.fn(),
    } as any);

    render(<CobroMesaDrawer mesaId="mesa1" mesaNumero="12" onClose={vi.fn()} onPaid={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Por plato' }));

    // Plato 1 ($60) queda en Comensal 1 (default). Plato 2 ($40) se reasigna a Comensal 2.
    const chipsC2 = screen.getAllByRole('button', { name: 'C2' });
    fireEvent.click(chipsC2[1]);

    elegirTicket();
    const cobrarComensal1 = screen.getByRole('button', { name: /Cobrar comensal 1/i });
    fireEvent.click(cobrarComensal1);

    await waitFor(() => {
      expect(registrarPago).toHaveBeenNthCalledWith(1, {
        cuentaId: 'cuenta1',
        montoRecibido: 60,
        divisionPlanId: 'plan-1', divisionParteId: 'parte-0', divisionVersion: 1,
        metodo: 'EFECTIVO',
        descuento: 0,
        propina: 0,
        mesaNumero: '12',
        tipoComprobante: 'TICKET',
        documentoV2: true,
      });
    });

    const cobrarComensal2 = await screen.findByRole('button', { name: /Registrar pago y cerrar cuenta/i });
    elegirTicket();
    await waitFor(() => expect(cobrarComensal2).not.toBeDisabled());
    fireEvent.click(cobrarComensal2);

    await waitFor(() => {
      expect(registrarPago).toHaveBeenNthCalledWith(2, {
        cuentaId: 'cuenta1',
        montoRecibido: 40,
        divisionPlanId: 'plan-1', divisionParteId: 'parte-1', divisionVersion: 1,
        metodo: 'EFECTIVO',
        descuento: 0,
        propina: 0,
        mesaNumero: '12',
        tipoComprobante: 'TICKET',
        documentoV2: true,
      });
    });
  });
});
