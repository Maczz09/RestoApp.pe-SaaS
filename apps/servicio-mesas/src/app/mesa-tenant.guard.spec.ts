import { MesaTenantGuard } from './mesa-tenant.guard';
function setup(extra: Record<string, unknown> = {}) {
  const request = { method: 'PATCH', path: '/api/mesa1/estado', params: { id: 'mesa1' }, body: {}, user: { sub: 'admin', rol: 'ADMIN', tenantId: 'tenant-a', sedeId: 'sede-a' }, ...extra };
  const context = { getType: () => 'http', switchToHttp: () => ({ getRequest: () => request }) };
  const prisma = { mesa: { findUnique: jest.fn().mockResolvedValue({ tenantId: 'tenant-a', sedeId: 'sede-a' }), findMany: jest.fn() }, ubicacion: { findUnique: jest.fn() } };
  return { guard: new MesaTenantGuard(prisma as never), context, prisma };
}
describe('SaaS salon object access', () => {
  it('allows staff in the signed branch', async () => { const { guard, context } = setup(); expect(await guard.canActivate(context as never)).toBe(true); });
  it.each([{ tenantId: 'tenant-b', sedeId: 'sede-a' }, { tenantId: null, sedeId: 'sede-b' }, null])('rejects foreign or absent table %j', async row => {
    const { guard, context, prisma } = setup(); prisma.mesa.findUnique.mockResolvedValue(row);
    await expect(guard.canActivate(context as never)).rejects.toThrow('no encontrado');
  });
  it('rejects a foreign table hidden in a group selection', async () => {
    const { guard, context, prisma } = setup({ params: {}, body: { mesaIds: ['m1','m2'] } });
    prisma.mesa.findMany.mockResolvedValue([{ sedeId: 'sede-a', tenantId: 'tenant-a' }, { sedeId: 'sede-b', tenantId: 'tenant-b' }] as never);
    await expect(guard.canActivate(context as never)).rejects.toThrow('no encontrado');
  });
  it('rejects a foreign location on table creation', async () => {
    const { guard, context, prisma } = setup({ params: {}, body: { ubicacionId: 'ajena' } });
    prisma.ubicacion.findUnique.mockResolvedValue({ sedeId: 'sede-b' } as never);
    await expect(guard.canActivate(context as never)).rejects.toThrow('no encontrado');
  });
  it('keeps the internal account and order integrations available', async () => {
    const { guard, context, prisma } = setup({ user: { rol: 'SISTEMA', sub: 'servicio-cuentas' } });
    expect(await guard.canActivate(context as never)).toBe(true);
    expect(prisma.mesa.findUnique).not.toHaveBeenCalled();
  });
});
