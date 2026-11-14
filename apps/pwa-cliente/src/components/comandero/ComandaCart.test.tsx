// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ComandaCart } from './ComandaCart';
import type { useComanda } from '../../hooks/useComanda';

describe('ComandaCart notas por unidad', () => {
  it('muestra dos notas para dos cabritos y edita únicamente la unidad elegida', () => {
    const setNotaUnidad = vi.fn();
    const cmd = {
      lines: [{ producto: { id: 'cabrito', nombre: 'Cabrito', precio: 35 }, cantidad: 2, notas: 'parte pierna', notasPorUnidad: ['parte pierna', 'sin ají'], noteOpen: true }],
      totalItems: 2, subtotal: 70, igv: 10.68, ctxValido: true, puedeEnviar: true,
      setNotaUnidad, toggleNote: vi.fn(), incLine: vi.fn(), delLine: vi.fn(), vaciar: vi.fn(), enviar: vi.fn(),
    } as unknown as ReturnType<typeof useComanda>;
    render(<ComandaCart cmd={cmd} modoAgregar={false} />);
    expect(screen.getByLabelText('Nota de Cabrito, unidad 1')).toHaveValue('parte pierna');
    expect(screen.getByLabelText('Nota de Cabrito, unidad 2')).toHaveValue('sin ají');
    fireEvent.change(screen.getByLabelText('Nota de Cabrito, unidad 2'), { target: { value: 'bien cocido' } });
    expect(setNotaUnidad).toHaveBeenCalledWith('cabrito', 1, 'bien cocido');
    expect(screen.getByRole('button', { name: /Enviar a cocina/ })).toBeEnabled();
  });
});
