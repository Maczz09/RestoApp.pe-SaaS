import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { EditarUsuarioCommand } from '@org/contracts';

// Real password hashing + in-memory persistence: exercise create -> login -> edit.
describe('Tenant team access regression scenarios', () => {
  function setup() {
    let user: any;
    let membership: any;
    const tenant = { id: 'tenant-a', slug: 'restaurante-a', nombre: 'A', activo: true, plan: 'ESTANDAR', createdAt: new Date() };
    const sede = { id: 'sede-a', tenantId: tenant.id, nombre: 'Principal', activa: true, direccion: null, ruc: null, telefono: null };
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: tenant.id }]),
      usuario: {
        findUnique: jest.fn(async ({ where }: any) => user && (where.id === user.id || where.email === user.email) ? { ...user, membresias: membership ? [membership] : [] } : null),
        create: jest.fn(async ({ data }: any) => user = { id: 'employee', ...data, activo: true, failedLoginAttempts: 0, lockedUntil: null, createdAt: new Date() }),
        update: jest.fn(async ({ data }: any) => user = { ...user, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      sede: { findUnique: jest.fn().mockResolvedValue(sede), findFirst: jest.fn().mockImplementation(async ({ where }: any) => where.tenantId === tenant.id && where.id === sede.id ? sede : null) },
      membresia: {
        create: jest.fn(async ({ data }: any) => membership = { ...data, id: 'membership-a', activo: true, tenant, sedes: data.sedes ? [{ sedeId: sede.id, sede }] : [] }),
        findUnique: jest.fn(async ({ where }: any) => where.tenantId_usuarioId.tenantId === tenant.id ? membership : null),
        findMany: jest.fn(async ({ where }: any) => membership && (!where.tenant?.slug || where.tenant.slug === tenant.slug) ? [membership] : []),
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn(async ({ data }: any) => { membership = { ...membership, ...data, sedes: data.sedes?.create ? [{ sedeId: data.sedes.create.sedeId, sede }] : [] }; return membership; }),
      },
      auditoriaLog: { create: jest.fn().mockResolvedValue({}) },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    tx.$transaction = async (fn: any) => fn(tx);
    const jwt = { sign: jest.fn().mockReturnValue('signed-token') };
    const service = new AuthService(tx as PrismaService, jwt as unknown as JwtService);
    const create = () => service.crearUsuario({ nombre: 'Equipo', email: 'Equipo@Example.com', password: 'original-password', rol: 'MESERO', sedeId: sede.id }, tenant.id);
    return { service, tx, jwt, create };
  }

  it('new employee can log in on its own subdomain with the original password', async () => {
    const { service, create, jwt } = setup();
    await create();
    const result = await service.login({ email: 'equipo@example.com', password: 'original-password' }, 'restaurante-a');
    expect(result.activeTenantId).toBe('tenant-a');
    expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-a', rol: 'MESERO', allowedSedeIds: ['sede-a'] }));
  });

  it('valid credentials do not authorize a different restaurant', async () => {
    const { service, create } = setup(); await create();
    await expect(service.login({ email: 'equipo@example.com', password: 'original-password' }, 'restaurante-b')).rejects.toThrow('no pertenece');
  });

  it('edit changes name and password, resets lockout and revokes refresh sessions', async () => {
    const { service, create, tx } = setup(); await create();
    await service.editarUsuario('employee', { nombre: 'Nuevo', password: 'new-password' }, 'owner', 'tenant-a');
    expect(tx.usuario.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ failedLoginAttempts: 0, lockedUntil: null }) }));
    expect(tx.refreshToken.updateMany).toHaveBeenCalled();
    expect((await service.login({ email: 'equipo@example.com', password: 'new-password' }, 'restaurante-a')).usuario.nombre).toBe('Nuevo');
    await expect(service.login({ email: 'equipo@example.com', password: 'original-password' }, 'restaurante-a')).rejects.toThrow('Credenciales');
  });

  it('omitting password preserves it while editing email', async () => {
    const { service, create } = setup(); await create();
    await service.editarUsuario('employee', { email: 'nuevo@example.com' }, 'owner', 'tenant-a');
    expect((await service.login({ email: 'nuevo@example.com', password: 'original-password' }, 'restaurante-a')).usuario.email).toBe('nuevo@example.com');
  });

  it.each(['PLATFORM_ADMIN', 'SISTEMA'])('rejects elevated role %s', async (rol) => {
    const { service, create } = setup(); await create();
    await expect(service.editarUsuario('employee', { rol } as EditarUsuarioCommand, 'owner', 'tenant-a')).rejects.toThrow('Rol no permitido');
  });

  it('rejects editing another tenant and assigning a foreign branch', async () => {
    const { service, create } = setup(); await create();
    await expect(service.editarUsuario('employee', { nombre: 'X' }, 'owner', 'tenant-b')).rejects.toThrow('no encontrado');
    await expect(service.editarUsuario('employee', { sedeId: 'foreign' }, 'owner', 'tenant-a')).rejects.toThrow('sede activa');
  });

  it('rejects a foreign branch at creation and filters the team by membership', async () => {
    const { service, tx } = setup();
    await expect(service.crearUsuario({ nombre: 'X', email: 'x@example.com', password: 'password123', rol: 'MESERO', sedeId: 'sede-a' }, 'tenant-b')).rejects.toThrow('sede indicada');
    expect(tx.usuario.create).not.toHaveBeenCalled();
    await service.listarUsuarios({}, null, 'tenant-a');
    expect(tx.usuario.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { membresias: { some: { tenantId: 'tenant-a' } } } }));
  });

  it('protects the last admin and synchronizes role/state with membership', async () => {
    const { service, create, tx } = setup(); await create();
    await service.cambiarRol('employee', { rol: 'ADMIN' }, 'owner', 'tenant-a');
    await expect(service.cambiarEstado('employee', { activo: false }, 'owner', 'tenant-a')).rejects.toThrow('al menos un administrador');
    await expect(service.cambiarRol('employee', { rol: 'MESERO' }, 'owner', 'tenant-a')).rejects.toThrow('al menos un administrador');
    tx.membresia.count.mockResolvedValue(2);
    await service.editarUsuario('employee', { rol: 'MESERO', sedeId: 'sede-a' }, 'owner', 'tenant-a');
    await service.cambiarEstado('employee', { activo: false }, 'owner', 'tenant-a');
    expect(tx.membresia.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ rol: 'MESERO', activo: false }) }));
  });
});
