import { describe, expect, it } from 'vitest';
import { assertTenantHostAccess } from './tenant-host';

describe('evaluación de aislamiento tenant por host', () => {
  it('mantiene aislamiento con la raíz anidada sin apropiarse del dominio principal', () => {
    const root = 'restoapp.mavricitas.com';
    const signedUser = { rol: 'ADMIN', tenantId: 'tenant-lima', tenantSlug: 'resto-lima' };
    const cases = [
      { host: `resto-lima.${root}`, allow: true },
      { host: `resto-cusco.${root}`, allow: false },
      { host: root, allow: false },
      { host: 'mavricitas.com', allow: false },
      { host: 'web.mavricitas.com', allow: false },
      { host: `resto-lima.${root}.evil.test`, allow: false },
      { host: `a.resto-lima.${root}`, allow: false },
      { host: `resto-lima.${root}:99999`, allow: false },
    ];
    const accepted = cases.map(({ host, allow }) => {
      try { assertTenantHostAccess(host, signedUser, { rootDomains: [root], nodeEnv: 'production' }); return allow; }
      catch { return !allow; }
    });
    expect(accepted.filter(Boolean).length / cases.length).toBe(1);
  });
  it('bloquea todos los casos adversariales sin falsos positivos', () => {
    const signedUser = {
      rol: 'ADMIN',
      tenantId: 'tenant-lima',
      tenantSlug: 'resto-lima',
    };
    const cases = [
      { host: 'resto-lima.restoapp.pe', allow: true },
      { host: 'resto-lima.localhost:8000', allow: true },
      { host: 'resto-cusco.restoapp.pe', allow: false },
      { host: 'resto-lima.restoapp.pe.evil.test', allow: false },
      { host: 'resto-lima.restoapp.pe,evil.test', allow: false },
      { host: 'a.resto-lima.restoapp.pe', allow: false },
      { host: 'resto-lima..restoapp.pe', allow: false },
      { host: 'resto-lima.restoapp.pe:99999', allow: false },
    ];

    const results = cases.map(({ host, allow }) => {
      let accepted = true;
      try {
        assertTenantHostAccess(host, signedUser, { nodeEnv: 'production' });
      } catch {
        accepted = false;
      }
      return accepted === allow;
    });

    const score = results.filter(Boolean).length / results.length;
    expect(score).toBe(1);
  });

  it('no convierte roles privilegiados en bypass web general', () => {
    expect(() =>
      assertTenantHostAccess(
        'resto-lima.restoapp.pe',
        { rol: 'PLATFORM_ADMIN', sessionScope: 'PLATFORM' },
        { nodeEnv: 'production' },
      ),
    ).toThrow();
    expect(() =>
      assertTenantHostAccess(
        'resto-lima.restoapp.pe',
        { rol: 'SISTEMA' },
        { nodeEnv: 'production', serviceName: 'servicio-mesas' },
      ),
    ).toThrow();
  });
});
