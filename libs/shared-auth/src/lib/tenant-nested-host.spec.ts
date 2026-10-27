import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertTenantHostAccess, configuredTenantRootDomains, resolveTenantHost, tenantBaseDomain } from './tenant-host';

const root = 'restoapp.mavricitas.com';
const user = { rol: 'ADMIN', tenantId: 'tenant-1', tenantSlug: 'cevicheria' };
afterEach(() => vi.unstubAllEnvs());

describe('SaaS delegated below the existing main domain', () => {
  it('resolves the nested root even when an overlapping parent is configured first', () => {
    expect(resolveTenantHost(`cevicheria.${root}`, ['mavricitas.com', root])).toMatchObject({ tenantSlug: 'cevicheria', scope: 'tenant' });
    expect(resolveTenantHost(root, ['mavricitas.com', root])).toMatchObject({ tenantSlug: null, scope: 'base' });
  });

  it('loads one configured root for domain creation and host validation', () => {
    vi.stubEnv('TENANT_BASE_DOMAIN', root);
    vi.stubEnv('TENANT_ROOT_DOMAINS', root);
    expect(tenantBaseDomain()).toBe(root);
    expect(configuredTenantRootDomains()).toEqual([root]);
    expect(assertTenantHostAccess(`cevicheria.${root}`, user, { nodeEnv: 'production' }).tenantSlug).toBe('cevicheria');
  });

  it.each(['https://restoapp.mavricitas.com', '*.restoapp.mavricitas.com', 'restoapp.mavricitas.com:443', '127.0.0.1', ''])('rejects invalid creation root %s', (rootValue) => {
    vi.stubEnv('TENANT_BASE_DOMAIN', rootValue);
    expect(() => tenantBaseDomain()).toThrow('TENANT_BASE_DOMAIN');
  });

  it.each([
    'mavricitas.com', 'otro.mavricitas.com', 'otro.restoapp.mavricitas.com',
    'a.cevicheria.restoapp.mavricitas.com', 'cevicheria.restoapp.mavricitas.com.evil.test',
    'restoapp.mavricitas.com',
  ])('rejects cross-tenant or parent-domain access on %s', (host) => {
    expect(() => assertTenantHostAccess(host, user, { rootDomains: [root], nodeEnv: 'production' })).toThrow();
  });

  it('keeps the platform session on its base domain', () => {
    const admin = { rol: 'PLATFORM_ADMIN', sessionScope: 'PLATFORM' as const };
    expect(assertTenantHostAccess(root, admin, { rootDomains: [root], nodeEnv: 'production' }).scope).toBe('base');
    expect(() => assertTenantHostAccess(`cevicheria.${root}`, admin, { rootDomains: [root], nodeEnv: 'production' })).toThrow();
  });
});
