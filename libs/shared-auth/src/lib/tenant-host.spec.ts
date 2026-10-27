import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  assertTenantHostAccess,
  normalizeRequestHost,
  resolveTenantHost,
} from './tenant-host';

describe('tenant-host', () => {
  describe('normalizeRequestHost', () => {
    it.each([
      [' Demo.RestoApp.pe:443 ', 'demo.restoapp.pe'],
      ['demo.localhost:8000', 'demo.localhost'],
      ['restoapp.pe.', 'restoapp.pe'],
      ['[::1]:8000', '::1'],
      ['127.0.0.1:8000', '127.0.0.1'],
    ])('normaliza %s', (input, expected) => {
      expect(normalizeRequestHost(input)).toBe(expected);
    });

    it.each([
      'https://demo.restoapp.pe',
      'demo.restoapp.pe/ruta',
      'demo.restoapp.pe,evil.test',
      'usuario@demo.restoapp.pe',
      'demo.restoapp.pe:99999',
      'demo..restoapp.pe',
      '-demo.restoapp.pe',
      '999.1.1.1',
    ])('rechaza Host malformado: %s', (input) => {
      expect(normalizeRequestHost(input)).toBeNull();
    });
  });

  describe('resolveTenantHost', () => {
    it.each([
      ['cevicheria-norte.restoapp.pe', 'cevicheria-norte'],
      ['cevicheria-norte.localhost:8000', 'cevicheria-norte'],
    ])('extrae slug desde %s', (host, slug) => {
      expect(resolveTenantHost(host)).toEqual({
        hostname: host.replace(':8000', ''),
        tenantSlug: slug,
        scope: 'tenant',
      });
    });

    it.each(['restoapp.pe', 'localhost', 'api.restoapp.pe', 'admin.localhost'])(
      'clasifica %s como host base',
      (host) => expect(resolveTenantHost(host).scope).toBe('base'),
    );

    it.each(['a.b.restoapp.pe', 'demo.restoapp.pe.evil.test', 'example.test'])(
      'no interpreta %s como tenant',
      (host) => expect(resolveTenantHost(host).scope).toBe('unknown'),
    );
  });

  describe('assertTenantHostAccess', () => {
    const tenantUser = {
      rol: 'ADMIN',
      tenantId: 'tenant-1',
      tenantSlug: 'cevicheria-norte',
    };

    it('acepta cuando el slug firmado coincide con el subdominio', () => {
      expect(
        assertTenantHostAccess('cevicheria-norte.restoapp.pe', tenantUser, {
          nodeEnv: 'production',
        }).tenantSlug,
      ).toBe('cevicheria-norte');
    });

    it.each([
      [{ ...tenantUser, tenantSlug: 'otro-restaurante' }],
      [{ ...tenantUser, tenantSlug: null }],
      [{ ...tenantUser, tenantId: null }],
    ])('rechaza token ausente o de otro tenant', (user) => {
      expect(() =>
        assertTenantHostAccess('cevicheria-norte.restoapp.pe', user, {
          nodeEnv: 'production',
        }),
      ).toThrow(ForbiddenException);
    });

    it('limita PLATFORM_ADMIN al host base o reservado', () => {
      expect(
        assertTenantHostAccess(
          'platform.restoapp.pe',
          { rol: 'PLATFORM_ADMIN', sessionScope: 'PLATFORM' },
          { nodeEnv: 'production' },
        ).scope,
      ).toBe('base');
      expect(() =>
        assertTenantHostAccess(
          'cevicheria-norte.restoapp.pe',
          { rol: 'PLATFORM_ADMIN', sessionScope: 'PLATFORM' },
          { nodeEnv: 'production' },
        ),
      ).toThrow('host administrativo');
      expect(() =>
        assertTenantHostAccess(
          'platform.restoapp.pe',
          { rol: 'PLATFORM_ADMIN', sessionScope: 'TENANT' },
          { nodeEnv: 'production' },
        ),
      ).toThrow('host administrativo');
    });

    it('limita SISTEMA al host interno del servicio esperado', () => {
      expect(
        assertTenantHostAccess(
          'servicio-inventario:3000',
          { rol: 'SISTEMA' },
          {
            nodeEnv: 'production',
            serviceName: 'servicio-inventario',
          },
        ).hostname,
      ).toBe('servicio-inventario');
      expect(() =>
        assertTenantHostAccess(
          'cevicheria-norte.restoapp.pe',
          { rol: 'SISTEMA' },
          {
            nodeEnv: 'production',
            serviceName: 'servicio-inventario',
          },
        ),
      ).toThrow('host interno');
    });

    it.each(['localhost:8000', 'restoapp.pe', 'api.restoapp.pe'])(
      'mantiene compatibilidad de desarrollo en host base %s',
      (host) => {
        expect(
          assertTenantHostAccess(host, tenantUser, { nodeEnv: 'development' })
            .scope,
        ).toBe('base');
      },
    );

    it.each(['restoapp.pe', 'app.restoapp.pe', 'api.restoapp.pe'])(
      'rechaza una sesión tenant en el host base productivo %s',
      (host) => {
        expect(() =>
          assertTenantHostAccess(host, tenantUser, { nodeEnv: 'production' }),
        ).toThrow('debe usar su subdominio');
      },
    );

    it('permite localhost en el stack de desarrollo solo con el flag explicito', () => {
      expect(
        assertTenantHostAccess('localhost:8000', tenantUser, {
          nodeEnv: 'production',
          allowLocalhostTenant: true,
        }).scope,
      ).toBe('base');
      expect(() =>
        assertTenantHostAccess('restoapp.pe', tenantUser, {
          nodeEnv: 'production',
          allowLocalhostTenant: true,
        }),
      ).toThrow('debe usar su subdominio');
    });

    it('rechaza hosts ajenos en producción', () => {
      expect(() =>
        assertTenantHostAccess('tenant.evil.test', tenantUser, {
          nodeEnv: 'production',
        }),
      ).toThrow('Host no autorizado');
    });
  });
});
