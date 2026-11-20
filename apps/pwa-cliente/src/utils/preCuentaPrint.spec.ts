// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { imprimirPreCuenta } from './preCuentaPrint';
import type { CuentaVM } from '../types/cuenta.types';

describe('REST-105 safe browser pre-account printing', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('prints isolated content as text and never runs item markup', () => {
    const doc = document.implementation.createHTMLDocument('');
    const popup = { document: doc, opener: {}, focus: vi.fn(), print: vi.fn() };
    vi.stubGlobal('open', vi.fn().mockReturnValue(popup));
    const cuenta = { id: 'account', estado: 'ABIERTA', total: 35, pedidos: [{ items: [{ nombre: '<img src=x onerror=alert(1)>', notas: '<script>bad()</script>', cantidad: 1, subtotal: 35, estado: 'LISTO' }] }] } as unknown as CuentaVM;
    expect(imprimirPreCuenta({ cuenta, mesaNumero: '03' })).toBe(true);
    expect(doc.querySelector('img')).toBeNull(); expect(doc.querySelector('script')).toBeNull();
    expect(doc.body.textContent).toContain('<img src=x');
    expect(doc.body.textContent).toContain('No es comprobante de pago');
    expect(popup.print).toHaveBeenCalledOnce(); expect(popup.opener).toBeNull();
    expect(cuenta.estado).toBe('ABIERTA');
  });
  it('reports a blocked popup without changing account data', () => {
    vi.stubGlobal('open', vi.fn().mockReturnValue(null));
    expect(imprimirPreCuenta({ cuenta: {} as CuentaVM, mesaNumero: '03' })).toBe(false);
  });
});
