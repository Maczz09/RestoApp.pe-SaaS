import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeConfig, envTemplate, nginxConfig, caddyConfig, caddyComposeConfig, imageNames, validateDomain, SERVICES } from './config.mjs';

test('VPS exposes only the loopback gateway and keeps all databases private', () => {
  const config = composeConfig('release-test');
  const published = Object.entries(config.services).filter(([, service]) => service.ports?.length);
  assert.deepEqual(published.map(([name]) => name), ['kong']);
  assert.deepEqual(config.services.kong.ports, ['127.0.0.1:${GATEWAY_PORT:-18000}:8000']);
  for (const name of SERVICES) {
    const service = config.services[`servicio-${name}`];
    assert.equal(service.environment.TENANT_ROOT_DOMAINS, '${TENANT_ROOT_DOMAINS:?Falta TENANT_ROOT_DOMAINS}');
    assert.equal(service.environment.TENANT_LOCALHOST_DEV, 'false');
    assert.equal(service.environment.COOKIE_SECURE, 'true');
    assert.equal(service.environment.NODE_ENV, 'production');
    assert.ok(config.services[`db-${name}`].volumes.length);
    if (name !== 'identidad') assert.equal(service.environment.JWT_PRIVATE_KEY, undefined);
  }
});

test('offline image inventory and Compose use the same immutable release tag', () => {
  const config = composeConfig('vps-test');
  const images = imageNames('vps-test');
  assert.equal(images.length, 13);
  for (const name of SERVICES) assert.ok(images.includes(config.services[`servicio-${name}`].image));
  assert.ok(images.includes(config.services.kong.image));
  assert.ok(images.includes(config.services['pwa-cliente'].image));
  assert.equal(config.services.watchtower, undefined);
  assert.equal(config.services['bootstrap-admin'].profiles[0], 'ops');
  assert.throws(() => imageNames('bad;tag'));
});

test('Kong origin regex accepts only HTTPS tenants under the nested root', () => {
  const text = envTemplate('restoapp.mavricitas.com');
  const line = text.split('\n').find((row) => row.startsWith('KONG_CORS_ORIGINS='));
  const origins = JSON.parse(line.slice("KONG_CORS_ORIGINS='".length, -1));
  assert.equal(origins[0], 'https://restoapp.mavricitas.com');
  const regex = new RegExp(origins[1]);
  assert.ok(regex.test('https://cevicheria.restoapp.mavricitas.com'));
  for (const origin of ['http://demo.restoapp.mavricitas.com', 'https://a.b.restoapp.mavricitas.com', 'https://demo.restoapp.mavricitas.com.evil.test', 'https://demoXrestoappXmavricitasXcom', 'https://demo.restoapp.mavricitas.com:444']) assert.equal(regex.test(origin), false, origin);
});

test('Nginx preserves tenant host and WebSocket upgrade without claiming the occupied apex', () => {
  const text = nginxConfig('restoapp.mavricitas.com');
  assert.ok(text.includes('server_name restoapp.mavricitas.com *.restoapp.mavricitas.com;'));
  assert.ok(text.includes('proxy_set_header Host $host;'));
  assert.ok(text.includes('proxy_set_header Upgrade $http_upgrade;'));
  assert.ok(text.includes('/etc/letsencrypt/live/restoapp.mavricitas.com/'));
  assert.equal(text.includes('server_name mavricitas.com;'), false);
  for (const domain of ['https://foo.com', 'foo.com:443', 'foo.com/;', '*.foo.com']) assert.throws(() => validateDomain(domain));
});

test('Caddy integration exposes only Kong to the existing proxy network', () => {
  const overlay = caddyComposeConfig();
  assert.deepEqual(Object.keys(overlay.services), ['kong']);
  assert.equal(overlay.networks.caddy_proxy.external, true);
  assert.deepEqual(overlay.services.kong.networks.caddy_proxy.aliases, ['restoapp-gateway']);
  assert.ok(overlay.services.kong.networks.default);
  assert.equal(overlay.services.kong.ports, undefined);
  assert.equal(overlay.services['agendly-caddy'], undefined);
});

test('Caddy site targets the gateway container and supports both TLS provisioning paths', () => {
  const files = caddyConfig('restoapp.mavricitas.com');
  assert.ok(files.includes('restoapp.mavricitas.com, *.restoapp.mavricitas.com'));
  assert.ok(files.includes('reverse_proxy restoapp-gateway:8000'));
  assert.ok(files.includes('tls /etc/caddy/restoapp-tls/fullchain.pem'));
  assert.equal(files.includes('127.0.0.1:18000'), false);
  assert.ok(caddyConfig('restoapp.mavricitas.com', 'cloudflare').includes('dns cloudflare {env.CLOUDFLARE_API_TOKEN}'));
});
