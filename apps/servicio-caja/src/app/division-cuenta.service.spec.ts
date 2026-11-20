import { DivisionCuentaService, validarParteDivision, completarParteDivision } from './division-cuenta.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma';
import { CuentasHttpClient } from './cuentas-http.client';
import { unidadesDivision } from '@org/contracts';

const pedidos = [{ items: [{ id: 'item', productoId: 'prod', nombre: 'Cabrito', cantidad: 2, precioUnitario: 10, notas: 'Sin ají' }] }];
const config = { modo: 'PARTES' as const, numPartes: 2, descuento: 0, propina: 2 };
const planBase = () => ({ id: 'plan', cuentaId: 'cuenta', tenantId: 'tenant-a', sedeId: 'sede-a', version: 1, modo: 'PARTES', totalCentimos: 2000, descuentoCentimos: 0, propinaCentimos: 200, config, unidades: unidadesDivision(pedidos), partes: [
  { id: 'parte', indice: 0, label: 'Parte 1', montoCentimos: 1000, propinaCentimos: 100, pagada: false, unidades: [], items: [{ productoId: 'prod', nombre: 'Cabrito', cantidad: 1, precioUnitario: 10 }], transaccionIds: [] },
] });

function setup() {
  const plan = planBase();
  const tx = {
    cajaFusionReserva: { findUnique: jest.fn().mockResolvedValue(null) },
    cajaFusionAlias: { findUnique: jest.fn().mockResolvedValue(null) },
    $executeRaw: jest.fn(),
    divisionCuenta: { findUnique: jest.fn().mockResolvedValue(plan), create: jest.fn().mockResolvedValue(plan), update: jest.fn().mockResolvedValue(plan), delete: jest.fn() },
    divisionParte: { findUnique: jest.fn().mockResolvedValue({ ...plan.partes[0], division: plan }), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    transaccion: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([{ id: 'tx', monto: new Prisma.Decimal(10) }]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    pagoPendiente: { count: jest.fn().mockResolvedValue(0) },
  };
  const prisma = { ...tx, $transaction: jest.fn((cb) => cb(tx)) };
  const cuentas = { fetchCuenta: jest.fn().mockResolvedValue({ id: 'cuenta', tenantId: 'tenant-a', sedeId: 'sede-a', total: 20, estado: 'ABIERTA', pedidos }) };
  const service = new DivisionCuentaService(prisma as unknown as PrismaService, cuentas as unknown as CuentasHttpClient);
  return { tx, plan, service, cuentas };
}

describe('REST-103 persistent division', () => {
  it('accepts JSONB object-key ordering without confusing it with changed plates', async () => {
    const { tx, plan } = setup();
    plan.unidades = plan.unidades.map(u => Object.fromEntries(Object.entries(u).reverse())) as typeof plan.unidades;
    await expect(validarParteDivision(tx as never, { cuentaId:'cuenta',tenantId:'tenant-a',planId:'plan',parteId:'parte',version:1,montoCentimos:1000,propinaCentimos:100,descuentoCentimos:0,totalCentimos:2000,pedidos })).resolves.toMatchObject({ parteId:'parte' });
  });
  it('adds a new consumption without rewriting the already paid portion', async () => {
    const { service, tx, cuentas, plan } = setup(); plan.partes[0].pagada = true;
    cuentas.fetchCuenta.mockResolvedValue({ id:'cuenta',tenantId:'tenant-a',sedeId:'sede-a',total:30,estado:'ABIERTA',pedidos:[...pedidos,{items:[{id:'extra',productoId:'bebida',nombre:'Bebida',cantidad:1,precioUnitario:10,notas:''}]}] });
    await service.ampliar('cuenta',1,'tenant-a');
    const data = tx.divisionCuenta.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ totalCentimos:3000, partes:{create:{label:'Consumos adicionales',montoCentimos:1000}} });
    expect(data.partes).not.toHaveProperty('deleteMany');
    expect(plan.partes[0].pagada).toBe(true);
  });
  it('cancels an unpaid draft but never removes a plan with settled portions', async () => {
    const { service, tx, plan } = setup();
    await expect(service.eliminar('cuenta', 'tenant-a')).resolves.toEqual({ eliminada: true });
    expect(tx.divisionCuenta.delete).toHaveBeenCalledWith({ where: { id: 'plan' } });
    tx.divisionCuenta.delete.mockClear(); plan.partes[0].pagada = true;
    await expect(service.eliminar('cuenta', 'tenant-a')).rejects.toThrow('ya tiene cobros');
    expect(tx.divisionCuenta.delete).not.toHaveBeenCalled();
  });
  const payment = { cuentaId: 'cuenta', tenantId: 'tenant-a', planId: 'plan', parteId: 'parte', version: 1, montoCentimos: 1000, propinaCentimos: 100, descuentoCentimos: 0, totalCentimos: 2000, pedidos };
  it('restores the stored assignments and paid flags on a fresh request', async () => {
    const { service, plan } = setup(); plan.partes[0].pagada = true;
    const loaded = await service.obtener('cuenta', 'tenant-a', 'sede-a');
    expect(loaded?.partes[0].pagada).toBe(true);
    expect(loaded?.id).toBe('plan');
  });
  it('rejects cross-tenant and cross-branch reads', async () => {
    const { service } = setup();
    await expect(service.obtener('cuenta', 'tenant-b')).rejects.toThrow('no encontrada');
    await expect(service.obtener('cuenta', 'tenant-a', 'sede-b')).rejects.toThrow('no encontrada');
  });
  it('does not edit paid assignments or permit stale plan versions', async () => {
    const { service, plan } = setup();
    await expect(service.guardar('cuenta', { ...config, version: 8 }, 'tenant-a')).rejects.toThrow('cambió');
    plan.partes[0].pagada = true;
    await expect(service.guardar('cuenta', { ...config, version: 1 }, 'tenant-a')).rejects.toThrow('bloqueada');
  });
  it('locks plans once legacy payments or queued payments exist', async () => {
    const { service, tx } = setup(); tx.transaccion.count.mockResolvedValue(1);
    await expect(service.guardar('cuenta', { ...config, version: 1 }, 'tenant-a')).rejects.toThrow('bloqueada');
    tx.transaccion.count.mockResolvedValue(0); tx.pagoPendiente.count.mockResolvedValue(1);
    await expect(service.guardar('cuenta', { ...config, version: 1 }, 'tenant-a')).rejects.toThrow('bloqueada');
  });
  it('requires the selected unpaid part even if the client bypasses the drawer', async () => {
    const { tx } = setup();
    await expect(validarParteDivision(tx as unknown as Prisma.TransactionClient, { ...payment, parteId: undefined })).rejects.toThrow('selecciona');
    await expect(validarParteDivision(tx as unknown as Prisma.TransactionClient, { ...payment, montoCentimos: 2000 })).rejects.toThrow('importes');
    expect((await validarParteDivision(tx as unknown as Prisma.TransactionClient, payment))?.items[0].nombre).toBe('Cabrito');
  });
  it('rejects replay, stale dishes, stale totals and foreign parts', async () => {
    const { tx, plan } = setup();
    for (const override of [{ version: 3 }, { totalCentimos: 3000 }, { parteId: 'foreign' }, { pedidos: [{ items: [] }] }]) {
      await expect(validarParteDivision(tx as unknown as Prisma.TransactionClient, { ...payment, ...override })).rejects.toThrow();
    }
    plan.partes[0].pagada = true;
    await expect(validarParteDivision(tx as unknown as Prisma.TransactionClient, payment)).rejects.toThrow('pagada');
  });
  it('atomically links all payment methods to one paid portion', async () => {
    const { tx } = setup();
    await completarParteDivision(tx as unknown as Prisma.TransactionClient, 'parte', ['tx']);
    expect(tx.transaccion.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['tx'] } }, data: { divisionParteId: 'parte' } });
    expect(tx.divisionParte.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ pagada: true, transaccionIds: ['tx'] }) }));
    tx.transaccion.findMany.mockResolvedValue([]);
    await expect(completarParteDivision(tx as unknown as Prisma.TransactionClient, 'parte', ['foreign'])).rejects.toThrow('no corresponden');
  });
});
