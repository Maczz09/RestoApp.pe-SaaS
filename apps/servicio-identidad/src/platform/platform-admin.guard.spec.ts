import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PrismaService } from '../prisma/prisma.service';

function contextFor(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PlatformAdminGuard', () => {
  const guard = new PlatformAdminGuard();

  it('acepta una sesión PLATFORM_ADMIN global', () => {
    expect(
      guard.canActivate(
        contextFor({
          rol: 'PLATFORM_ADMIN',
          sessionScope: 'PLATFORM',
          tenantId: null,
        }),
      ),
    ).toBe(true);
  });

  it.each([
    ['sin usuario', undefined],
    ['admin de restaurante', { rol: 'ADMIN', sessionScope: 'TENANT', tenantId: 'tenant-1' }],
    ['scope incorrecto', { rol: 'PLATFORM_ADMIN', sessionScope: 'TENANT', tenantId: null }],
    ['tenant ligado', { rol: 'PLATFORM_ADMIN', sessionScope: 'PLATFORM', tenantId: 'tenant-1' }],
  ])('rechaza %s', (_case, user) => {
    expect(() => guard.canActivate(contextFor(user))).toThrow(ForbiddenException);
  });

  it('rechaza inmediatamente una cuenta de plataforma desactivada', async () => {
    const prisma = { usuario: { findUnique: jest.fn().mockResolvedValue({ rol: 'PLATFORM_ADMIN', activo: false }) } } as unknown as PrismaService;
    const checked = new PlatformAdminGuard(prisma);
    await expect(checked.canActivate(contextFor({ sub: 'platform-1', rol: 'PLATFORM_ADMIN', sessionScope: 'PLATFORM', tenantId: null }))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
