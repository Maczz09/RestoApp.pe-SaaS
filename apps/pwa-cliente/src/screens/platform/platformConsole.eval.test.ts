import { describe, expect, it } from 'vitest';
import { esPlatformAdmin, puedeAcceder } from '../../auth/permisos';
import { normalizeTenantDomain, slugifyTenant } from './TenantCreateScreen';

describe('eval de consola SaaS', () => {
  it('aísla al superadministrador de los módulos operativos del tenant', () => {
    expect(esPlatformAdmin('PLATFORM_ADMIN')).toBe(true);
    expect(puedeAcceder('PLATFORM_ADMIN', 'inicio')).toBe(false);
    expect(puedeAcceder('PLATFORM_ADMIN', 'caja')).toBe(false);
  });

  it('el acceso de auditoría no equivale a rol ADMIN ni habilita escritura de caja', () => {
    expect(puedeAcceder('PLATFORM_ADMIN', 'mesas')).toBe(false);
    expect(puedeAcceder('PLATFORM_ADMIN', 'pedidos')).toBe(false);
    expect(puedeAcceder('PLATFORM_ADMIN', 'usuarios')).toBe(false);
  });

  it.each([
    ['La Barra del Ceviche', 'la-barra-del-ceviche'],
    ['Mi Ñarcita Perú', 'mi-narcita-peru'],
    ['  Resto & Mar  ', 'resto-mar'],
  ])('produce un subdominio estable para %s', (name, expected) => {
    expect(slugifyTenant(name)).toBe(expected);
    expect(normalizeTenantDomain(`https://${expected}.RestoApp.pe/`)).toBe(`${expected}.restoapp.pe`);
  });

  it('limita el slug para que siga siendo válido en DNS', () => {
    expect(slugifyTenant('A'.repeat(90))).toHaveLength(48);
  });
});
