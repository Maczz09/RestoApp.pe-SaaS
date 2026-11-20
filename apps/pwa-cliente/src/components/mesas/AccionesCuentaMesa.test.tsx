// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccionesCuentaMesa } from './AccionesCuentaMesa';
import { solicitarCuenta } from '../../api/solicitudes-cuenta.api';
import { imprimirPreCuenta } from '../../utils/preCuentaPrint';
import type { CuentaVM } from '../../types/cuenta.types';

vi.mock('../../api/solicitudes-cuenta.api', () => ({ solicitarCuenta: vi.fn() }));
vi.mock('../../utils/preCuentaPrint', () => ({ imprimirPreCuenta: vi.fn().mockReturnValue(true) }));
const cuenta = { id: 'account', mesaId: 'table', estado: 'ABIERTA', total: 35, pedidos: [{ items: [
  { id: 'dish', nombre: 'Cabrito', cantidad: 1, notas: 'Parte pierna', subtotal: 35, estado: 'ENTREGADO' },
  { id: 'cancelled', nombre: 'Anulado', cantidad: 1, subtotal: 20, estado: 'CANCELADO' },
] }] } as unknown as CuentaVM;

describe('REST-105 / REST-106 mesa account actions', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(solicitarCuenta).mockResolvedValue({ id: 'r', cuentaId: 'account', solicitadaAt: '2026-11-19T15:00:00Z' }); });
  it('shows and prints a read-only pre-account without requesting or charging', () => {
    render(<AccionesCuentaMesa cuenta={cuenta} mesaNumero="03" online />);
    fireEvent.click(screen.getByRole('button', { name: 'Pre-Cuenta' }));
    expect(screen.getByText('1 × Cabrito')).toBeInTheDocument();
    expect(screen.getByText('Parte pierna')).toBeInTheDocument();
    expect(screen.queryByText('Anulado')).not.toBeInTheDocument();
    expect(screen.getByText('Documento informativo. No es comprobante de pago.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Imprimir Pre-Cuenta' }));
    expect(imprimirPreCuenta).toHaveBeenCalledWith({ cuenta, mesaNumero: '03' });
    expect(solicitarCuenta).not.toHaveBeenCalled();
  });
  it('requests once with the account UUID and leaves the table open', async () => {
    render(<AccionesCuentaMesa cuenta={cuenta} mesaNumero="03" online />);
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar Cuenta' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cuenta solicitada' })).toBeDisabled());
    expect(solicitarCuenta).toHaveBeenCalledExactlyOnceWith('account');
    expect(screen.getByRole('status')).toHaveTextContent('La mesa sigue abierta');
    expect(cuenta.estado).toBe('ABIERTA');
  });
  it('retains a retry after server failure and blocks requests offline', async () => {
    vi.mocked(solicitarCuenta).mockRejectedValueOnce(new Error('Servidor no responde'));
    const { rerender } = render(<AccionesCuentaMesa cuenta={cuenta} mesaNumero="03" online />);
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar Cuenta' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Servidor no responde'));
    expect(screen.getByRole('button', { name: 'Solicitar Cuenta' })).toBeEnabled();
    rerender(<AccionesCuentaMesa cuenta={cuenta} mesaNumero="03" online={false} />);
    expect(screen.getByRole('button', { name: 'Solicitar Cuenta' })).toBeDisabled();
  });
});
