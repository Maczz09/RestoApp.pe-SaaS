// Integration evaluation against an explicitly named, disposable local QA stack.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import http from 'node:http';
const require = createRequire(import.meta.url);
const { parse } = require('dotenv');
const { io } = require('socket.io-client');
const args = process.argv.slice(2);
const option = (key, fallback) => { const index = args.indexOf(key); return index < 0 ? fallback : args[index + 1]; };
const config = parse(readFileSync(option('--env', ''), 'utf8'));
if (option('--project')) config.COMPOSE_PROJECT_NAME = option('--project');
assert.match(config.COMPOSE_PROJECT_NAME, /^restoapp-vps-qa-/, 'Only disposable QA projects may receive test fixtures');
const origin = `http://127.0.0.1:${config.GATEWAY_PORT || '18000'}`;
const domain = config.TENANT_BASE_DOMAIN;
const results = [];
// Node 24 fetch ignores Host overrides. http.request preserves the virtual host
// while connecting to loopback, as an actual reverse proxy does.
function localFetch(url, init = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: init.method || 'GET', headers: init.headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => {
        const headers = new Headers();
        for (const [key, values] of Object.entries(res.headers)) for (const value of Array.isArray(values) ? values : [values]) if (value !== undefined) headers.append(key, value);
        resolve(new Response([204, 304].includes(res.statusCode) ? null : Buffer.concat(chunks), { status: res.statusCode, headers }));
      });
    });
    req.setTimeout(20000, () => req.destroy(new Error('Local request timed out')));
    req.on('error', reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}
async function request(path, { method = 'GET', host = domain, token, data, status = 200 } = {}) {
  const response = await localFetch(`${origin}/v1/${path}`, { method, headers: { Host: host, Origin: `https://${host}`, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(data ? { 'Content-Type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  assert.equal(response.status, status, `${method} ${path} @${host}: expected ${status}, received ${response.status}`);
  if (path === 'identidad/auth/login' && status === 200) {
    const cookies = response.headers.getSetCookie();
    const accessCookie = cookies.find((value) => value.startsWith('access_token='));
    assert.ok(accessCookie?.includes('HttpOnly') && accessCookie.includes('Secure'));
    assert.ok(cookies.every((value) => !/;\s*domain=/i.test(value)), 'Session cookies must remain host-only');
  }
  return response.json();
}
async function check(name, action) { await action(); results.push({ name, status: 'PASS' }); console.log(`PASS ${name}`); }
let adminToken;
await check('PWA served from SaaS gateway using the same origin', async () => {
  const response = await localFetch(`${origin}/login`, { headers: { Host: domain } });
  assert.equal(response.status, 200);
  assert.ok((await response.text()).includes('id="root"'));
});
await check('platform login on nested SaaS base', async () => {
  const login = await request('identidad/auth/login', { method: 'POST', data: { email: config.PLATFORM_ADMIN_EMAIL, password: config.PLATFORM_ADMIN_PASSWORD } });
  assert.equal(login.usuario.rol, 'PLATFORM_ADMIN');
  adminToken = login.access_token;
});
const tenants = [];
const suffix = randomBytes(4).toString('hex');
for (const letter of ['a', 'b']) {
  await check(`create isolated tenant ${letter} with generated nested domain and no sede`, async () => {
    const slug = `qa-${letter}-${suffix}`;
    const email = `${slug}@example.invalid`;
    const password = randomBytes(20).toString('base64url');
    const created = await request('identidad/platform/tenants', { method: 'POST', token: adminToken, status: 201, data: { nombre: `QA ${letter}`, slug, plan: 'ESTANDAR', administrador: { nombre: `QA admin ${letter}`, email, password } } });
    const tenant = created.tenant;
    assert.equal(created.sede, null);
    assert.equal(tenant.sedesCount, 0);
    assert.ok(tenant.domains.some((item) => item.domain === `${slug}.${domain}`));
    const login = await request('identidad/auth/login', { method: 'POST', host: `${slug}.${domain}`, data: { email, password } });
    assert.equal(login.usuario.rol, 'ADMIN');
    tenants.push({ id: tenant.id, host: `${slug}.${domain}`, token: login.access_token });
  });
}
for (const service of ['identidad', 'mesas', 'pedidos', 'cuentas', 'reservas', 'inventario', 'notificaciones', 'caja', 'reportes', 'facturacion', 'compras']) {
  await check(`gateway readiness ${service}`, () => request(`${service}/health/ready`, { host: tenants[0].host, token: tenants[0].token }));
}
await check('tenant A cannot read tenant B through its subdomain', async () => {
  await request('identidad/sedes', { host: tenants[1].host, token: tenants[0].token, status: 403 });
});
await check('tenant cannot use platform base for business data', async () => {
  await request('identidad/sedes', { token: tenants[0].token, status: 403 });
});
await check('superadmin cannot enter tenant host as its owner', async () => {
  await request('identidad/platform/summary', { token: adminToken, host: tenants[0].host, status: 403 });
});
await check('tenant API on correct host returns its empty sede list', async () => {
  const response = await request('identidad/sedes', { host: tenants[0].host, token: tenants[0].token });
  assert.deepEqual(response.sedes, []);
});
await check('wildcard HTTPS CORS is recognized by gateway', async () => {
  const response = await localFetch(`${origin}/v1/identidad/sedes`, { method: 'OPTIONS', headers: { Host: tenants[0].host, Origin: `https://${tenants[0].host}`, 'Access-Control-Request-Method': 'GET' } });
  assert.equal(response.headers.get('access-control-allow-origin'), `https://${tenants[0].host}`);
});
await check('foreign origin does not receive credentialed CORS access', async () => {
  const response = await localFetch(`${origin}/v1/identidad/sedes`, { method: 'OPTIONS', headers: { Host: tenants[0].host, Origin: `https://${tenants[0].host}.evil.test`, 'Access-Control-Request-Method': 'GET' } });
  assert.notEqual(response.headers.get('access-control-allow-origin'), `https://${tenants[0].host}.evil.test`);
});

function socketCheck(host, token, allowed) {
  return new Promise((resolve, reject) => {
    const socket = io(origin, { path: '/v1/notificaciones/socket.io', transports: ['websocket'], reconnection: false, auth: { token }, extraHeaders: { Host: host, Origin: `https://${host}`, Cookie: `access_token=${token}` }, timeout: 10000 });
    let settling;
    const timer = setTimeout(() => finish(new Error('Socket evaluation timed out')), 12000);
    function finish(error) { clearTimeout(timer); clearTimeout(settling); socket.removeAllListeners(); socket.disconnect(); error ? reject(error) : resolve(); }
    socket.on('connect', () => { if (allowed) settling = setTimeout(() => finish(), 500); });
    socket.on('auth:error', () => finish(allowed ? new Error('Socket rejected correct tenant') : undefined));
    socket.on('connect_error', (error) => finish(allowed ? new Error(error.message) : undefined));
    socket.on('disconnect', () => finish(allowed ? new Error('Socket disconnected correct tenant') : undefined));
  });
}
await check('WebSocket accepts the signed tenant on its nested host', () => socketCheck(tenants[0].host, tenants[0].token, true));
await check('WebSocket rejects cross-tenant host/token combination', () => socketCheck(tenants[1].host, tenants[0].token, false));
const report = { evaluatedAt: new Date().toISOString(), domain, project: config.COMPOSE_PROJECT_NAME, checks: results.length, results };
if (option('--report')) writeFileSync(option('--report'), JSON.stringify(report, null, 2));
console.log(`${results.length}/${results.length} VPS integration evaluations passed.`);
