import { describe, expect, it } from 'vitest';
import { calcularDivision, centimosDivision, unidadesDivision } from './divisionCuenta';

const pedidos = [{ id: 'pedido', estado: 'ENTREGADO', items: [
  { id: 'cabrito', productoId: 'producto', nombre: 'Cabrito', cantidad: 2, precioUnitario: 33.33, notas: 'Sin ají' },
  { id: 'ceviche', productoId: 'otro', nombre: 'Ceviche', cantidad: 1, precioUnitario: 33.34, notas: 'Picante' },
] }];

describe('REST-103 exact division contract scenarios', () => {
  it.each([2, 3, 7, 11, 50])('equal split preserves every cent and fiscal allocation across %i parts', numPartes => {
    const result = calcularDivision(100, pedidos, { modo: 'PARTES', numPartes, descuento: 7.01, propina: 9.99 });
    expect(result.reduce((n, p) => n + centimosDivision(p.monto), 0)).toBe(9299);
    expect(result.reduce((n, p) => n + centimosDivision(p.tip), 0)).toBe(999);
    result.forEach(p => expect(p.items.reduce((n, item) => n + centimosDivision(item.precioUnitario) * item.cantidad, 0)).toBe(centimosDivision(p.monto)));
  });

  it('assigns each same-dish physical unit independently with its own note', () => {
    const detail = [{ items: [
      { id: 'one', productoId: 'cabrito', nombre: 'Cabrito', cantidad: 1, subtotal: 30, notas: 'Parte pierna' },
      { id: 'two', productoId: 'cabrito', nombre: 'Cabrito', cantidad: 1, subtotal: 30, notas: 'Sin sal' },
    ] }];
    const result = calcularDivision(60, detail, { modo: 'ITEMS', numPartes: 2, asignaciones: { 'one:0': 1, 'two:0': 2 }, descuento: 0.01, propina: 1.01 });
    expect(result.map(p => p.unidades[0].notas)).toEqual(['Parte pierna', 'Sin sal']);
    expect(result.map(p => p.items[0].notas)).toEqual(['Parte pierna', 'Sin sal']);
    expect(result.reduce((n, p) => n + centimosDivision(p.monto), 0)).toBe(5999);
    expect(result.reduce((n, p) => n + centimosDivision(p.tip), 0)).toBe(101);
  });

  it('splits a quantity line into stable unit keys and excludes cancelled meals', () => {
    const values = unidadesDivision([...pedidos, { estado: 'CANCELADO', items: pedidos[0].items }]);
    expect(values.map(v => v.key)).toEqual(['cabrito:0', 'cabrito:1', 'ceviche:0']);
    expect(values.reduce((n, v) => n + v.centimos, 0)).toBe(10000);
  });

  it('rejects missing assignments, unknown units and stale account totals', () => {
    const config = { modo: 'ITEMS' as const, numPartes: 2, descuento: 0, propina: 0 };
    expect(() => calcularDivision(100, pedidos, config)).toThrow('Asigna');
    expect(() => calcularDivision(100, pedidos, { ...config, asignaciones: { unknown: 1 } })).toThrow('ajenos');
    expect(() => calcularDivision(99, pedidos, { ...config, modo: 'PARTES' })).toThrow('cambió');
  });
});
