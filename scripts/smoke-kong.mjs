#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

export const KONG_SERVICES = Object.freeze([
  'identidad',
  'mesas',
  'pedidos',
  'cuentas',
  'reservas',
  'inventario',
  'notificaciones',
  'caja',
  'reportes',
  'facturacion',
  'compras',
]);

export function buildSmokeTargets(baseUrl, probe = 'ready') {
  if (!['live', 'ready'].includes(probe)) {
    throw new Error('SMOKE_PROBE debe ser "live" o "ready".');
  }
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol)) {
    throw new Error('KONG_URL debe usar http o https.');
  }
  if (base.username || base.password || base.search || base.hash) {
    throw new Error(
      'KONG_URL no puede contener credenciales, query ni fragmento.',
    );
  }
  const basePath = base.pathname.replace(/\/+$/, '');

  return KONG_SERVICES.map((service) => ({
    service,
    url: new URL(`${basePath}/${service}/health/${probe}`, base).toString(),
  }));
}

export async function runKongSmoke({
  baseUrl = 'http://localhost:8000',
  token,
  probe = 'ready',
  timeoutMs = 5_000,
  tenantHost,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error(
      'Este runtime no incluye fetch. Se requiere Node.js 20 o superior.',
    );
  }

  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (tenantHost) headers.Host = validateTenantHostHeader(tenantHost);

  const targets = buildSmokeTargets(baseUrl, probe);
  const results = await Promise.all(
    targets.map(async ({ service, url }) => {
      const startedAt = performance.now();
      try {
        const response = await fetchImpl(url, {
          method: 'GET',
          headers,
          redirect: 'error',
          signal: AbortSignal.timeout(timeoutMs),
        });
        return {
          service,
          status: response.status,
          ok: response.status === 200,
          latencyMs: Math.round(performance.now() - startedAt),
        };
      } catch (error) {
        return {
          service,
          status: 0,
          ok: false,
          latencyMs: Math.round(performance.now() - startedAt),
          error: safeErrorName(error),
        };
      }
    }),
  );

  return {
    probe,
    total: results.length,
    passed: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
  };
}

function validateTenantHostHeader(value) {
  const host = String(value).trim().toLowerCase();
  if (!host || /[\s,@/\\?#]/.test(host) || host.includes('://')) {
    throw new Error('SMOKE_TENANT_HOST no es un Host HTTP válido.');
  }
  return host;
}

function safeErrorName(error) {
  if (error && typeof error === 'object' && 'name' in error) {
    return String(error.name).slice(0, 80);
  }
  return 'RequestError';
}

function printReport(report) {
  const rows = report.results.map(
    ({ service, status, ok, latencyMs, error }) => ({
      servicio: service,
      estado: ok ? 'UP' : 'DOWN',
      http: status || '-',
      ms: latencyMs,
      error: error ?? '',
    }),
  );
  console.table(rows);
  console.log(
    `Kong smoke ${report.probe}: ${report.passed}/${report.total} servicios disponibles; ${report.failed} fallos.`,
  );
}

async function main() {
  const report = await runKongSmoke({
    baseUrl: process.env.KONG_URL ?? 'http://localhost:8000',
    token: process.env.SMOKE_AUTH_TOKEN,
    probe: process.env.SMOKE_PROBE ?? 'ready',
    timeoutMs: Number(process.env.SMOKE_TIMEOUT_MS ?? 5_000),
    tenantHost: process.env.SMOKE_TENANT_HOST,
  });
  printReport(report);
  process.exitCode = report.failed === 0 ? 0 : 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
