import assert from 'node:assert/strict';
import test from 'node:test';
import { KONG_SERVICES, runKongSmoke } from './smoke-kong.mjs';

test('evaluación: un fallo parcial no oculta ni cancela los demás servicios', async () => {
  const failing = new Set(['pedidos', 'inventario', 'reportes']);
  const report = await runKongSmoke({
    fetchImpl: async (url) => {
      const service = KONG_SERVICES.find((name) => url.includes(`/${name}/`));
      if (service === 'inventario')
        throw new TypeError('detalle sensible interno');
      return { status: service && failing.has(service) ? 503 : 200 };
    },
  });

  assert.equal(report.total, 11);
  assert.equal(report.passed, 8);
  assert.equal(report.failed, 3);
  assert.deepEqual(
    report.results.filter(({ ok }) => !ok).map(({ service }) => service),
    ['pedidos', 'inventario', 'reportes'],
  );
  assert.equal(
    JSON.stringify(report).includes('detalle sensible interno'),
    false,
  );
});
