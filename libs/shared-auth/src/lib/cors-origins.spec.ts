import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCorsOrigins } from './cors-origins';

afterEach(() => vi.unstubAllEnvs());

describe('CORS with a delegated SaaS subdomain', () => {
  it('matches the base and one tenant level without matching the occupied parent site', () => {
    const [base, tenants] = parseCorsOrigins('https://restoapp.mavricitas.com, https://*.restoapp.mavricitas.com');
    expect(base).toBe('https://restoapp.mavricitas.com');
    expect(tenants).toBeInstanceOf(RegExp);
    const rule = tenants as RegExp;
    expect(rule.test('https://cevicheria.restoapp.mavricitas.com')).toBe(true);
    for (const origin of [
      'https://mavricitas.com', 'https://otro.mavricitas.com',
      'http://cevicheria.restoapp.mavricitas.com',
      'https://a.b.restoapp.mavricitas.com',
      'https://cevicheria.restoapp.mavricitas.com.evil.test',
      'https://cevicheriaXrestoappXmavricitasXcom',
      'https://-invalid.restoapp.mavricitas.com',
    ]) expect(rule.test(origin), origin).toBe(false);
  });

  it.each(['*', 'https://*', 'https://*.com/path', 'http://*.mavricitas.com', 'https://*.mavricitas.com:443', 'https://user:pass@mavricitas.com', 'https://mavricitas.com/path'])('rejects unsafe configuration %s', (value) => {
    expect(() => parseCorsOrigins(value)).toThrow();
  });

  it('requires HTTPS in production while preserving explicit localhost development', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => parseCorsOrigins('http://app.mavricitas.com')).toThrow('HTTPS');
    vi.stubEnv('NODE_ENV', 'development');
    expect(parseCorsOrigins('http://localhost:4200')).toEqual(['http://localhost:4200']);
  });

  it('permits HTTP localhost in the local Docker stack only with the explicit development flag', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TENANT_LOCALHOST_DEV', 'false');
    expect(() => parseCorsOrigins('http://localhost:4200')).toThrow('HTTPS');
    vi.stubEnv('TENANT_LOCALHOST_DEV', 'true');
    expect(parseCorsOrigins('http://localhost:4200,http://127.0.0.1:4200,http://[::1]:4200')).toEqual(['http://localhost:4200', 'http://127.0.0.1:4200', 'http://[::1]:4200']);
    expect(() => parseCorsOrigins('http://cevicheria.restoapp.mavricitas.com')).toThrow('HTTPS');
  });
});
