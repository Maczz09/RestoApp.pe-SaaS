import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTenantBaseDomain, getTenantDomain } from './tenantDomain';

afterEach(() => vi.unstubAllEnvs());

describe('tenant domain display and creation', () => {
  it('supports a SaaS base that is itself a subdomain', () => {
    vi.stubEnv('VITE_TENANT_BASE_DOMAIN', 'restoapp.mavricitas.com');
    expect(getTenantBaseDomain()).toBe('restoapp.mavricitas.com');
    expect(getTenantDomain('cevicheria')).toBe('cevicheria.restoapp.mavricitas.com');
    expect(getTenantDomain('')).toBe('');
  });

  it.each(['https://restoapp.mavricitas.com', '*.restoapp.mavricitas.com', 'restoapp.mavricitas.com:443'])('rejects incorrect build configuration %s', (domain) => {
    vi.stubEnv('VITE_TENANT_BASE_DOMAIN', domain);
    expect(() => getTenantBaseDomain()).toThrow('VITE_TENANT_BASE_DOMAIN');
  });
});
