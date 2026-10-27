import { BadRequestException } from '@nestjs/common';
import { PlatformService } from './platform.service';
import type { PrismaService } from '../prisma/prisma.service';

jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('test-password-hash') }));

describe('PlatformService tenant domains', () => {
  const originalEnv = { ...process.env };
  afterEach(() => { process.env = { ...originalEnv }; });

  function setup() {
    const tx = {
      tenant: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'tenant-1', plan: 'ESTANDAR' }) },
      tenantDomain: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
      usuario: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'user-1', nombre: 'Ana', email: 'ana@example.com', activo: true }) },
      membresia: { create: jest.fn().mockResolvedValue({ id: 'member-1' }) },
      auditoriaLog: { create: jest.fn() },
    };
    const prisma = {
      platformPlan: { findUnique: jest.fn().mockResolvedValue({ code: 'ESTANDAR', activo: true, cycleDays: 30 }) },
      $transaction: jest.fn().mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new PlatformService(prisma as unknown as PrismaService);
    jest.spyOn(service, 'obtenerTenant').mockResolvedValue({ id: 'tenant-1' } as never);
    return { tx, prisma, service };
  }

  const command = { nombre: 'Cevichería', slug: 'cevicheria', administrador: { nombre: 'Ana', email: 'ana@example.com', password: 'test-password-123' } };

  it('creates the default domain below the configured nested SaaS root', async () => {
    process.env.TENANT_BASE_DOMAIN = 'restoapp.mavricitas.com';
    const { tx, service } = setup();
    await service.crearTenant(command, 'platform-admin');
    expect(tx.tenantDomain.create).toHaveBeenCalledWith({ data: { tenantId: 'tenant-1', domain: 'cevicheria.restoapp.mavricitas.com', activo: true, principal: true } });
  });

  it.each(['admin', 'api', 'app', 'platform', 'superadmin', 'www'])('rejects reserved slug %s before creating business data', async (slug) => {
    process.env.TENANT_BASE_DOMAIN = 'restoapp.mavricitas.com';
    const { prisma, service } = setup();
    await expect(service.crearTenant({ ...command, slug }, 'platform-admin')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['restoapp.mavricitas.com', 'platform.restoapp.mavricitas.com', 'admin.restoapp.mavricitas.com'])('rejects a platform address as restaurant domain: %s', async (domain) => {
    process.env.TENANT_BASE_DOMAIN = 'restoapp.mavricitas.com';
    const { prisma, service } = setup();
    await expect(service.crearTenant({ ...command, domain }, 'platform-admin')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
