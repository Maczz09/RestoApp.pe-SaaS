import { ForbiddenException } from '@nestjs/common';
import { domainToASCII } from 'node:url';

export const DEFAULT_TENANT_ROOT_DOMAINS = [
  'restoapp.pe',
  'localhost',
] as const;

export const RESERVED_PLATFORM_SUBDOMAINS = new Set([
  'admin',
  'api',
  'app',
  'platform',
  'superadmin',
  'www',
]);

const DNS_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export type TenantHostScope = 'tenant' | 'base' | 'unknown' | 'invalid';

export interface TenantHostResolution {
  hostname: string | null;
  tenantSlug: string | null;
  scope: TenantHostScope;
}

export interface TenantHostUser {
  rol?: string | null;
  sessionScope?: 'PLATFORM' | 'TENANT';
  tenantId?: string | null;
  tenantSlug?: string | null;
}

export interface TenantHostAccessOptions {
  nodeEnv?: string;
  rootDomains?: readonly string[];
  serviceName?: string;
  allowLocalhostTenant?: boolean;
}

/**
 * Normaliza exclusivamente un header HTTP Host. No acepta URLs, user-info,
 * listas separadas por coma ni rutas. El puerto se valida y se elimina.
 */
export function normalizeRequestHost(rawHost: unknown): string | null {
  if (typeof rawHost !== 'string') return null;
  const raw = rawHost.trim().toLowerCase();
  if (
    !raw ||
    raw.length > 320 ||
    /[\s,@/\\?#]/.test(raw) ||
    raw.includes('://')
  ) {
    return null;
  }

  let hostname = raw;
  if (raw.startsWith('[')) {
    const close = raw.indexOf(']');
    if (close < 0) return null;
    hostname = raw.slice(1, close);
    const rest = raw.slice(close + 1);
    if (rest && !isValidPortSuffix(rest)) return null;
    // El único uso admitido aquí es reconocer un host local/base. Un literal
    // IPv6 nunca puede representar el slug de un tenant.
    return hostname.includes(':') ? hostname : null;
  }

  const colon = raw.lastIndexOf(':');
  if (colon >= 0) {
    if (raw.indexOf(':') !== colon || !isValidPortSuffix(raw.slice(colon))) {
      return null;
    }
    hostname = raw.slice(0, colon);
  }

  hostname = hostname.replace(/\.$/, '');
  if (!hostname || hostname.length > 253) return null;

  const ascii = domainToASCII(hostname).toLowerCase();
  if (!ascii || ascii.length > 253) return null;

  if (IPV4.test(ascii)) {
    const octets = ascii.split('.').map(Number);
    return octets.every((octet) => octet >= 0 && octet <= 255) ? ascii : null;
  }

  const labels = ascii.split('.');
  if (labels.some((label) => !DNS_LABEL.test(label))) return null;
  return ascii;
}

/** Resuelve un subdominio de un solo nivel en los dominios SaaS conocidos. */
export function resolveTenantHost(
  rawHost: unknown,
  rootDomains: readonly string[] = configuredTenantRootDomains(),
): TenantHostResolution {
  const hostname = normalizeRequestHost(rawHost);
  if (!hostname) return { hostname: null, tenantSlug: null, scope: 'invalid' };

  // The most specific SaaS root wins when migrating overlapping DNS zones.
  const roots = rootDomains.map((value) => normalizeRequestHost(value))
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.length - a.length);
  for (const root of roots) {
    if (hostname === root) {
      return { hostname, tenantSlug: null, scope: 'base' };
    }

    const suffix = `.${root}`;
    if (!hostname.endsWith(suffix)) continue;
    const prefix = hostname.slice(0, -suffix.length);
    if (!DNS_LABEL.test(prefix) || prefix.includes('.')) {
      return { hostname, tenantSlug: null, scope: 'unknown' };
    }
    if (RESERVED_PLATFORM_SUBDOMAINS.has(prefix)) {
      return { hostname, tenantSlug: null, scope: 'base' };
    }
    return { hostname, tenantSlug: prefix, scope: 'tenant' };
  }

  return { hostname, tenantSlug: null, scope: 'unknown' };
}

/**
 * Verifica que un JWT de usuario pertenezca al subdominio solicitado.
 * PLATFORM_ADMIN y SISTEMA son bypasses explícitos. Los hosts base se permiten
 * para login, selector de tenant y compatibilidad local; nunca aportan tenantId.
 */
export function assertTenantHostAccess(
  rawHost: unknown,
  user: TenantHostUser | null | undefined,
  options: TenantHostAccessOptions = {},
): TenantHostResolution {
  const resolved = resolveTenantHost(rawHost, options.rootDomains);
  const rol = String(user?.rol ?? '').toUpperCase();

  if (rol === 'PLATFORM_ADMIN') {
    if (user?.sessionScope !== 'PLATFORM' || resolved.scope !== 'base') {
      throw new ForbiddenException(
        'El administrador de plataforma debe usar el host administrativo de RestoApp.',
      );
    }
    return resolved;
  }

  if (rol === 'SISTEMA') {
    const serviceName = normalizeRequestHost(options.serviceName);
    const isExpectedInternalHost = Boolean(
      serviceName && resolved.hostname === serviceName,
    );
    const isLocalDevelopment =
      options.nodeEnv !== 'production' &&
      (resolved.hostname === 'localhost' ||
        resolved.hostname === '127.0.0.1' ||
        resolved.hostname === '::1');
    if (!isExpectedInternalHost && !isLocalDevelopment) {
      throw new ForbiddenException(
        'El token de servicio solo puede usarse contra su host interno.',
      );
    }
    return resolved;
  }

  if (resolved.scope === 'tenant') {
    const signedSlug = normalizeTenantSlug(user?.tenantSlug);
    if (!user?.tenantId || !signedSlug || signedSlug !== resolved.tenantSlug) {
      throw new ForbiddenException(
        'El restaurante de la sesión no coincide con el subdominio solicitado.',
      );
    }
    return resolved;
  }

  // El host base sirve login y consola de plataforma. En producción un JWT
  // operativo no puede usarlo para consultar datos: debe entrar por el
  // subdominio firmado del restaurante. En desarrollo se conserva localhost
  // para no exigir DNS local durante las pruebas manuales.
  if (
    resolved.scope === 'base' &&
    options.nodeEnv === 'production' &&
    !(options.allowLocalhostTenant && resolved.hostname === 'localhost')
  ) {
    throw new ForbiddenException(
      'La sesión del restaurante debe usar su subdominio de RestoApp.',
    );
  }

  if (
    options.nodeEnv === 'production' &&
    (resolved.scope === 'unknown' || resolved.scope === 'invalid')
  ) {
    throw new ForbiddenException('Host no autorizado para RestoApp.');
  }

  return resolved;
}

export function configuredTenantRootDomains(): readonly string[] {
  const configured = process.env.TENANT_ROOT_DOMAINS?.split(',')
    .map((domain) => normalizeRequestHost(domain))
    .filter((domain): domain is string => Boolean(domain));
  const base = process.env.TENANT_BASE_DOMAIN ? tenantBaseDomain() : null;
  if (process.env.NODE_ENV === 'production' && process.env.TENANT_ROOT_DOMAINS && !configured?.length) {
    throw new Error('TENANT_ROOT_DOMAINS must contain a valid DNS hostname');
  }
  return base ? Array.from(new Set([base, ...(configured ?? [])])) : configured?.length ? configured : DEFAULT_TENANT_ROOT_DOMAINS;
}

/** Root used when creating tenant domains; it may itself be a subdomain. */
export function tenantBaseDomain(): string {
  const raw = process.env.TENANT_BASE_DOMAIN ?? process.env.TENANT_ROOT_DOMAINS?.split(',')[0] ?? DEFAULT_TENANT_ROOT_DOMAINS[0];
  const domain = raw.trim().toLowerCase().replace(/\.$/, '');
  if (!domain.includes('.') || domain.includes(':') || IPV4.test(domain) || normalizeRequestHost(domain) !== domain) {
    throw new Error('TENANT_BASE_DOMAIN must be a DNS hostname without scheme, port or wildcard');
  }
  return domain;
}

function normalizeTenantSlug(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const slug = value.trim().toLowerCase();
  return DNS_LABEL.test(slug) ? slug : null;
}

function isValidPortSuffix(value: string): boolean {
  if (!/^:\d{1,5}$/.test(value)) return false;
  const port = Number(value.slice(1));
  return port >= 1 && port <= 65_535;
}
