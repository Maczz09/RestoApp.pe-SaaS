import { CuentaFusionService } from './cuenta-fusion.service';
import { Prisma } from '../generated/prisma';

function setup() {
  const pedidos = [50,70].map((total, index) => ({ id: `p${index + 1}`, estado: 'LISTO', total, items: [{ id: `i${index + 1}`, estado: 'LISTO', cantidad: 1, precioUnitario: total, notas: `Nota ${index + 1}` }] }));
  const cuentas = pedidos.map((p, i) => ({ id: `c${i + 1}`, mesaId: `m${i + 1}`, tenantId: 'tenant', sedeId: 'sede', estado: 'ABIERTA', total: new Prisma.Decimal(p.total), pedidos: [p], correlativo: `A000000${i + 1}` }));
  const huellas = Object.fromEntries(pedidos.map(p => [p.id, JSON.stringify({ estado: p.estado, total: p.total, items: p.items.map(i => ({ id: i.id, estado: i.estado, cantidad: 1, precio: i.precioUnitario, notas: i.notas })) })]));
  const command = { fusionId: 'fusion', tenantId: 'tenant', sedeId: 'sede', maestraMesaId: 'm1', maestraCuentaId: 'c1', cuentaIds: ['c1','c2'], pedidoIds: ['p1','p2'], huellas };
  const tx = { $executeRaw: jest.fn(), cuenta: { findMany: jest.fn().mockResolvedValue(cuentas), update: jest.fn() }, cuentaFusion: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() }, cuentaFusionAlias: { create: jest.fn() }, outboxEvent: { create: jest.fn() } };
  const prisma = { ...tx, $transaction: jest.fn(cb => cb(tx)) };
  return { service: new CuentaFusionService(prisma as never), tx, command, cuentas };
}
describe('REST-102, consolidación de consumos activos', () => {
  it('suma S/50 + S/70 sin cobrar y conserva los platos, notas e historial secundarios', async () => {
    const { service, tx, command, cuentas } = setup();
    const original = JSON.stringify(cuentas);
    await expect(service.fusionar(command)).resolves.toEqual({ estado: 'CONFIRMADA' });
    const master = tx.cuenta.update.mock.calls[0][0];
    expect(master.where).toEqual({ id: 'c1' });
    expect(Number(master.data.total)).toBe(120);
    expect(master.data.pedidos.map((p: { id: string }) => p.id)).toEqual(['p1','p2']);
    expect(master.data.pedidos[1].items[0].notas).toBe('Nota 2');
    expect(tx.cuenta.update).toHaveBeenNthCalledWith(2, { where: { id: 'c2' }, data: { estado: 'FUSIONADA', tenantId: 'tenant' } });
    expect(tx.cuentaFusionAlias.create).toHaveBeenCalledWith({ data: { cuentaId: 'c2', maestraCuentaId: 'c1', fusionId: 'fusion' } });
    expect(JSON.stringify(cuentas)).toBe(original);
  });
  it('rechaza cuentas ajenas o de otra sede antes de modificar consumos', async () => {
    const { service, command, cuentas, tx } = setup();
    cuentas[1].tenantId = 'otro';
    await expect(service.fusionar(command)).rejects.toThrow('misma sede y restaurante');
    expect(tx.cuenta.update).not.toHaveBeenCalled();
  });
  it('espera que el detalle completo se sincronice en lugar de perder un pedido', async () => {
    const { service, command, tx } = setup();
    await expect(service.fusionar({ ...command, pedidoIds: ['p1'] })).rejects.toThrow('sincronización completa');
    expect(tx.cuenta.update).not.toHaveBeenCalled();
  });
  it('no suma otra vez al reintentar una unión confirmada', async () => {
    const { service, command, tx } = setup();
    tx.cuentaFusion.findUnique.mockResolvedValue({ ...command } as never);
    await expect(service.fusionar(command)).resolves.toEqual({ estado: 'CONFIRMADA' });
    expect(tx.cuenta.update).not.toHaveBeenCalled();
  });
});
