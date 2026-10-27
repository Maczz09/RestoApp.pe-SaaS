import { describe, it, expect } from 'vitest';
import { resolveTenantId } from './resolve-tenant';
import { ForbiddenException } from '@nestjs/common';

describe('resolveTenantId', () => {
  it('retorna el tenantId del usuario si coincide o no se solicita otro', () => {
    expect(resolveTenantId('tenant-123')).toBe('tenant-123');
    expect(resolveTenantId('tenant-123', 'tenant-123')).toBe('tenant-123');
  });

  it('rechaza con ForbiddenException si se intenta acceder a otro tenant con token de usuario regular', () => {
    expect(() =>
      resolveTenantId('tenant-123', 'tenant-otro', 'MESERO'),
    ).toThrow(ForbiddenException);
    expect(() => resolveTenantId('tenant-123', 'tenant-otro', 'ADMIN')).toThrow(
      ForbiddenException,
    );
  });

  it('permite operar sobre otro tenant al rol SISTEMA (S2S) y PLATFORM_ADMIN', () => {
    expect(resolveTenantId('tenant-123', 'tenant-otro', 'SISTEMA')).toBe(
      'tenant-otro',
    );
    expect(resolveTenantId(null, 'tenant-otro', 'PLATFORM_ADMIN')).toBe(
      'tenant-otro',
    );
  });

  it('exige tenant explícito incluso para operaciones privilegiadas', () => {
    expect(() => resolveTenantId(null, null, 'SISTEMA')).toThrow(
      ForbiddenException,
    );
    expect(() => resolveTenantId(null, null, 'PLATFORM_ADMIN')).toThrow(
      ForbiddenException,
    );
  });

  it('no asigna silenciosamente el tenant demo a un usuario regular sin tenant', () => {
    expect(() => resolveTenantId(null, null, 'ADMIN')).toThrow(
      ForbiddenException,
    );
    expect(() => resolveTenantId()).toThrow(ForbiddenException);
  });
});
