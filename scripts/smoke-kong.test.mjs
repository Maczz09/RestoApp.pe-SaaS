import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildSmokeTargets,
  KONG_SERVICES,
  runKongSmoke,
} from './smoke-kong.mjs';

test('construye exactamente los 11 health checks vía Kong', () => {
  const targets = buildSmokeTargets('http://localhost:8000', 'ready');
  assert.equal(targets.length, 11);
  assert.deepEqual(
    targets.map(({ service }) => service),
    [...KONG_SERVICES],
  );
  assert.equal(targets[0].url, 'http://localhost:8000/identidad/health/ready');
  assert.equal(
    targets.at(-1).url,
    'http://localhost:8000/compras/health/ready',
  );
});

test('reporta todos los status sin incluir el token en la salida', async () => {
  const secretToken = 'token-super-secreto-que-no-debe-aparecer';
  const seen = [];
  const report = await runKongSmoke({
    token: secretToken,
    tenantHost: 'demo.localhost:8000',
    fetchImpl: async (url, options) => {
      seen.push({ url, options });
      return { status: url.includes('/compras/') ? 503 : 200 };
    },
  });

  assert.equal(report.total, 11);
  assert.equal(report.passed, 10);
  assert.equal(report.failed, 1);
  assert.equal(seen.length, 11);
  assert.equal(seen[0].options.headers.Authorization, `Bearer ${secretToken}`);
  assert.equal(seen[0].options.headers.Host, 'demo.localhost:8000');
  assert.equal(JSON.stringify(report).includes(secretToken), false);
  assert.equal(JSON.stringify(report).includes('Authorization'), false);
});

test('no permite credenciales ni protocolos ajenos en KONG_URL', () => {
  assert.throws(() => buildSmokeTargets('file:///tmp/kong'));
  assert.throws(() => buildSmokeTargets('http://user:password@localhost:8000'));
});

test('Kong conserva el Host original en las rutas de los 11 servicios', async () => {
  const template = await readFile(
    new URL('../infra/kong/kong.yml.template', import.meta.url),
    'utf8',
  );
  for (const service of KONG_SERVICES) {
    const route = service === 'identidad' ? 'identidad' : service;
    assert.match(
      template,
      new RegExp(`- name: ${route}\\r?\\n\\s+preserve_host: true`),
      `la ruta ${route} debe preservar Host`,
    );
  }
});
