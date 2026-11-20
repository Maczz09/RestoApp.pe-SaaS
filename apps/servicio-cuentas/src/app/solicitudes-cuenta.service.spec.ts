import { ConflictException, NotFoundException } from '@nestjs/common';
import { SolicitudesCuentaService } from './solicitudes-cuenta.service';
import { SolicitudesCuentaController } from './solicitudes-cuenta.controller';

describe('REST-106 request an active account', () => {
  const actor = { tenantId: 'tenant-a', sedeId: 'branch-a', usuarioId: 'waiter', nombre: 'Mesero' };
  const cuenta = { id: 'account', tenantId: 'tenant-a', sedeId: 'branch-a', mesaId: 'table', estado: 'ABIERTA', correlativo: 'A0000001', total: 70, pedidos: [{ numeroMesa: 3 }] };
  function setup() {
    let row: any;
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      cuenta: { findUnique: jest.fn().mockResolvedValue(cuenta), findMany: jest.fn().mockResolvedValue([cuenta]) },
      solicitudCuenta: {
        upsert: jest.fn().mockImplementation(async ({ create }: any) => row ??= { id: 'request', ...create, solicitadaAt: new Date('2026-11-19T15:00:00Z') }),
        findMany: jest.fn().mockImplementation(async () => row ? [row] : []),
      },
    };
    tx.$transaction = (fn: any) => fn(tx);
    return { tx, service: new SolicitudesCuentaService(tx) };
  }

  it('is idempotent and leaves account state/total untouched', async () => {
    const { tx, service } = setup();
    expect(await service.solicitar('account', actor)).toEqual(await service.solicitar('account', actor));
    expect(tx.solicitudCuenta.upsert).toHaveBeenLastCalledWith(expect.objectContaining({ update: {} }));
    expect(cuenta.estado).toBe('ABIERTA'); expect(cuenta.total).toBe(70);
    expect(tx.cuenta.update).toBeUndefined();
  });

  it.each(['PAGADA', 'CERRADA', 'CANCELADA'])('rejects %s accounts', async (estado) => {
    const { tx, service } = setup(); tx.cuenta.findUnique.mockResolvedValue({ ...cuenta, estado });
    await expect(service.solicitar('account', actor)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.solicitudCuenta.upsert).not.toHaveBeenCalled();
  });

  it('rejects foreign tenant and foreign branch even for a known UUID', async () => {
    const { service } = setup();
    await expect(service.solicitar('account', { ...actor, tenantId: 'tenant-b' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.solicitar('account', { ...actor, sedeId: 'branch-b' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists scoped live requests and hides them after closure/payment', async () => {
    const { service, tx } = setup(); await service.solicitar('account', actor);
    expect(await service.listar(actor)).toEqual([expect.objectContaining({ cuentaId: 'account', numeroMesa: 3, total: 70 })]);
    expect(tx.cuenta.findMany).toHaveBeenCalledWith({ where: { sedeId: 'branch-a', OR: [{ tenantId: 'tenant-a' }, { tenantId: null }], estado: 'ABIERTA' } });
    expect(tx.solicitudCuenta.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-a', sedeId: 'branch-a', cuentaId: { in: ['account'] } } }));
    tx.cuenta.findMany.mockResolvedValue([]);
    expect(await service.listar(actor)).toEqual([]);
  });

  it('controller derives actor from the signed session and rejects missing/foreign branch claims', async () => {
    const { service } = setup(); const controller = new SolicitudesCuentaController(service);
    expect(() => controller.solicitar('account', { user: { sub: 'waiter', tenantId: 'tenant-a', sedeId: 'branch-a', allowedSedeIds: ['branch-b'] } })).toThrow();
  });
});
