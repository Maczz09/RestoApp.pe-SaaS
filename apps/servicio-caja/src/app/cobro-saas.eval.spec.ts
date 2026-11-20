import { AppService } from './app.service';
import { CuentasHttpClient } from './cuentas-http.client';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma';
import { lineasDocumento, validarDocumentoCobro } from './documento-cobro';
import { CuentaRemota } from './cuentas-http.client';
import { PedidoEstado } from '@org/contracts';

const money = (n: number) => new Prisma.Decimal(n);
function setup() {
  const cuenta: CuentaRemota = { id: 'cuenta', mesaId: 'mesa', sedeId: 'sede', tenantId: 'tenant', total: 200, estado: 'ABIERTA', pedidos: [{ id: 'pedido', mesaId: 'mesa', total: 200, createdAt: new Date().toISOString(), estado: PedidoEstado.Entregado, items: [{ id: 'plato', productoId: 'prod', nombre: 'Cabrito', cantidad: 2, precioUnitario: 100 }] }] };
  let sequence = 0;
  const tx = {
    $executeRaw: jest.fn(),
    turnoCaja: { findFirst: jest.fn().mockResolvedValue({ id: 'turno', sedeId: 'sede', cajaId: 'T1', fondoInicial: 0, estado: 'ABIERTA', abiertoAt: new Date(), createdAt: new Date(), updatedAt: new Date() }) },
    cajaFusionReserva: { findUnique: jest.fn().mockResolvedValue(null) },
    cajaFusionAlias: { findUnique: jest.fn().mockResolvedValue(null) },
    divisionCuenta: { findUnique: jest.fn().mockResolvedValue(null) },
    cuentaAbierta: { upsert: jest.fn().mockResolvedValue({ ...cuenta, cuentaId: cuenta.id }), update: jest.fn() },
    transaccion: { aggregate: jest.fn().mockResolvedValue({ _sum: { monto: 0 }, _min: { descuento: null }, _max: { descuento: null } }), create: jest.fn(({ data }) => Promise.resolve({ ...data, id: `tx-${++sequence}`, createdAt: new Date() })) },
    movimientoCaja: { create: jest.fn() }, outboxEvent: { create: jest.fn() },
    serieTicketInterno: { upsert: jest.fn().mockResolvedValue({ correlativo: 7 }) },
    documentoCobro: { create: jest.fn(({ data }) => Promise.resolve({ ...data, id: 'doc', createdAt: new Date() })) },
  };
  const prisma = { ...tx, $transaction: jest.fn(cb => cb(tx)) };
  const cuentas = { fetchCuenta: jest.fn().mockResolvedValue(cuenta), validarEmisor: jest.fn(), cerrarCuenta: jest.fn().mockResolvedValue({}) };
  const service = new AppService(prisma as unknown as PrismaService, cuentas as unknown as CuentasHttpClient);
  const command = { cuentaId: 'cuenta', tipoComprobante: 'TICKET' as const, pagos: [{ metodo: 'TARJETA' as const, monto: 100 }, { metodo: 'EFECTIVO' as const, monto: 60 }, { metodo: 'YAPE' as const, monto: 40 }] };
  return { tx, prisma, cuentas, cuenta, service, command };
}

describe('REST-101/104 SaaS: documento y cobro único con varios medios', () => {
  it('cobra S/200 en tarjeta100 + efectivo60 + Yape40, un ticket y un cierre', async () => {
    const { service, command, tx, cuentas, prisma } = setup();
    const result = await service.registrarPagoCombinado(command, 'cajero', 'Ana', 'sede', 'tenant');
    expect(result.pendiente).toBe(0);
    expect(result.ticket).toMatchObject({ serie: 'TI01', correlativo: 7, total: 200 });
    expect(result.documento?.medios.map(m => [m.metodo, m.monto])).toEqual([['TARJETA', 100], ['EFECTIVO', 60], ['YAPE', 40]]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.transaccion.create).toHaveBeenCalledTimes(3);
    expect(tx.documentoCobro.create).toHaveBeenCalledTimes(1);
    expect(tx.movimientoCaja.create.mock.calls.map(([arg]) => [arg.data.metodo, Number(arg.data.monto)])).toEqual([['TARJETA',100],['EFECTIVO',60],['YAPE',40]]);
    expect(cuentas.cerrarCuenta).toHaveBeenCalledWith('cuenta', 0, true);
    expect(cuentas.validarEmisor).not.toHaveBeenCalled();
    expect(tx.outboxEvent.create.mock.calls.some(([arg]) => arg.data.routingKey === 'caja.emision_cobro_solicitada')).toBe(false);
  });
  it('exige un documento incluso si un cliente antiguo omite documentoV2', async () => {
    const { service, command, tx } = setup();
    await expect(service.registrarPagoCombinado({ ...command, tipoComprobante: undefined }, 'cajero', 'Ana', 'sede', 'tenant')).rejects.toThrow('Selecciona el tipo');
    expect(tx.transaccion.create).not.toHaveBeenCalled();
  });
  it.each(['BOLETA', 'FACTURA'] as const)('crea solo una solicitud fiscal de %s y ningún ticket interno', async tipo => {
    const { service, command, tx, cuentas } = setup();
    const result = await service.registrarPagoCombinado({ ...command, tipoComprobante: tipo, empresaRuc: '20123456789', ...(tipo === 'FACTURA' ? { clienteDocumento: '20987654321', clienteRazonSocial: 'Cliente SAC' } : {}) }, 'cajero', 'Ana', 'sede', 'tenant');
    expect(result.ticket).toBeUndefined();
    expect(result.documento).toMatchObject({ tipo, estado: 'PENDIENTE_EMISION' });
    expect(cuentas.validarEmisor).toHaveBeenCalledWith('tenant', 'sede', '20123456789');
    expect(tx.serieTicketInterno.upsert).not.toHaveBeenCalled();
    const fiscal = tx.outboxEvent.create.mock.calls.filter(([arg]) => arg.data.routingKey === 'caja.emision_cobro_solicitada');
    expect(fiscal).toHaveLength(1);
    expect(JSON.parse(fiscal[0][0].data.payload)).toMatchObject({ total: 200, tenantId: 'tenant', sedeId: 'sede', cobroId: 'doc' });
  });
  it.each(['tenant-ajeno', ''])('impide cobrar desde otro restaurante (%s)', async tenant => {
    const { service, command, tx } = setup();
    await expect(service.registrarPagoCombinado(command, 'cajero', 'Ana', 'sede', tenant)).rejects.toThrow();
    expect(tx.transaccion.create).not.toHaveBeenCalled();
  });
  it('rechaza un céntimo faltante, pagos repetidos y cuentas en fusión', async () => {
    const { service, command, tx } = setup();
    await expect(service.registrarPagoCombinado({ ...command, pagos: command.pagos.map((p,i) => ({ ...p, monto: p.monto - (i === 0 ? 0.01 : 0) })) }, 'cajero', 'Ana', 'sede', 'tenant')).rejects.toThrow('saldo exacto');
    tx.transaccion.aggregate.mockResolvedValue({ _sum: { monto: 200 }, _min: { descuento: null }, _max: { descuento: null } });
    await expect(service.registrarPagoCombinado(command, 'cajero', 'Ana', 'sede', 'tenant')).rejects.toThrow('cobrada por completo');
    tx.cajaFusionReserva.findUnique.mockResolvedValue({ fusionId: 'fusion' } as never);
    await expect(service.registrarPagoCombinado(command, 'cajero', 'Ana', 'sede', 'tenant')).rejects.toThrow('se está uniendo');
    expect(tx.transaccion.create).not.toHaveBeenCalled();
  });
  it('identifica boletas por encima de S/700 y exige RUC y razón social para factura', () => {
    expect(() => validarDocumentoCobro({ tipoComprobante: 'BOLETA', empresaRuc: '20123456789' }, money(700))).not.toThrow();
    expect(() => validarDocumentoCobro({ tipoComprobante: 'BOLETA', empresaRuc: '20123456789' }, money(700.01))).toThrow('DNI');
    expect(() => validarDocumentoCobro({ tipoComprobante: 'FACTURA', empresaRuc: '20123456789', clienteDocumento: '12345678' }, money(200))).toThrow('razón social');
  });
  it.each([0.01, 33.33, 199.99])('distribuye S/%s sobre unidades sin perder céntimos', total => {
    const { cuenta } = setup();
    const items = lineasDocumento(cuenta, money(total));
    expect(items.reduce((sum, i) => sum + Math.round(i.precioUnitario * 100) * i.cantidad, 0)).toBe(Math.round(total * 100));
  });
});
