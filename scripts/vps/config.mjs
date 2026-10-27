// Deployment is generated from one inventory, so builds, archives and Compose agree.
export const SERVICES = ['identidad', 'mesas', 'pedidos', 'cuentas', 'reservas', 'inventario', 'notificaciones', 'caja', 'reportes', 'facturacion', 'compras'];
export const DEFAULT_DOMAIN = 'restoapp.mavricitas.com';
export const RUNTIME_IMAGES = ['postgres:16-alpine', 'rabbitmq:3-management'];

export function validateDomain(value) {
  const domain = String(value).trim().toLowerCase();
  if (domain.length > 180 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw new Error('El dominio debe ser un hostname DNS sin protocolo, puerto ni ruta.');
  return domain;
}

export function imageNames(tag) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(tag)) throw new Error('Tag de imagen inválido');
  return [...SERVICES.map((name) => `restoapp/servicio-${name}:${tag}`), `restoapp/pwa-cliente:${tag}`, `restoapp/kong:${tag}`];
}

export function composeConfig(tag) {
  const images = imageNames(tag);
  const services = {};
  const volumes = { 'rabbitmq-data': {}, comprobantes: {}, backups: {} };
  const logging = { driver: 'json-file', options: { 'max-size': '10m', 'max-file': '3' } };
  const common = { restart: 'unless-stopped', logging };
  services.rabbitmq = {
    ...common, image: RUNTIME_IMAGES[1], hostname: 'rabbitmq',
    environment: { RABBITMQ_DEFAULT_USER: '${RABBITMQ_USER:-restoapp}', RABBITMQ_DEFAULT_PASS: '${RABBITMQ_PASS:?Falta RABBITMQ_PASS}' },
    volumes: ['rabbitmq-data:/var/lib/rabbitmq'],
    healthcheck: { test: ['CMD', 'rabbitmq-diagnostics', 'check_running'], interval: '10s', timeout: '5s', retries: 10 },
  };
  for (const name of SERVICES) {
    volumes[`db-${name}`] = {};
    services[`db-${name}`] = {
      ...common, image: RUNTIME_IMAGES[0],
      environment: { POSTGRES_USER: '${DB_USER:-restoapp}', POSTGRES_PASSWORD: '${DB_PASS:?Falta DB_PASS}', POSTGRES_DB: `${name}_db` },
      volumes: [`db-${name}:/var/lib/postgresql/data`],
      healthcheck: { test: ['CMD-SHELL', 'pg_isready -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'], interval: '5s', timeout: '3s', retries: 15 },
    };
    const environment = {
      PORT: '3000', SERVICE_NAME: `servicio-${name}`, NODE_ENV: 'production',
      DATABASE_URL: `postgresql://$${'{DB_USER:-restoapp}'}:$${'{DB_PASS:?Falta DB_PASS}'}@db-${name}:5432/${name}_db?schema=public`,
      RABBITMQ_URI: 'amqp://${RABBITMQ_USER:-restoapp}:${RABBITMQ_PASS:?Falta RABBITMQ_PASS}@rabbitmq:5672',
      JWT_PUBLIC_KEY: '${JWT_PUBLIC_KEY:?Falta JWT_PUBLIC_KEY}', SERVICE_JWT_SECRET: '${SERVICE_JWT_SECRET:?Falta SERVICE_JWT_SECRET}', SERVICE_AUD_ENFORCE: 'true',
      TENANT_BASE_DOMAIN: '${TENANT_BASE_DOMAIN:?Falta TENANT_BASE_DOMAIN}', TENANT_ROOT_DOMAINS: '${TENANT_ROOT_DOMAINS:?Falta TENANT_ROOT_DOMAINS}',
      CORS_ORIGIN: '${CORS_ORIGIN:?Falta CORS_ORIGIN}', COOKIE_SECURE: 'true', COOKIE_SAMESITE: 'strict',
      // Do not allow the local-development host bypass in this stack.
      TENANT_LOCALHOST_DEV: 'false',
    };
    if (name === 'identidad') Object.assign(environment, { JWT_PRIVATE_KEY: '${JWT_PRIVATE_KEY:?Falta JWT_PRIVATE_KEY}', JWT_EXPIRES_IN: '15m', REFRESH_TOKEN_TTL_DAYS: '7' });
    if (name === 'pedidos') Object.assign(environment, { INVENTARIO_SERVICE_URL: 'http://servicio-inventario:3000/api', MESAS_SERVICE_URL: 'http://servicio-mesas:3000/api' });
    if (name === 'cuentas') environment.PEDIDOS_SERVICE_URL = 'http://servicio-pedidos:3000/api';
    if (name === 'caja') environment.CUENTAS_SERVICE_URL = 'http://servicio-cuentas:3000/api';
    if (name === 'facturacion') Object.assign(environment, { FACTURACION_CRED_ENCRYPTION_KEY: '${FACTURACION_CRED_ENCRYPTION_KEY:?Conservar clave de cifrado de facturacion}', SUNAT_WSDL_URL: '${SUNAT_WSDL_URL:-https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService?wsdl}' });
    if (name === 'compras') environment.COMPROBANTES_DIR = '/data/comprobantes';
    services[`servicio-${name}`] = {
      ...common, image: images[SERVICES.indexOf(name)], init: true, stop_grace_period: '30s', environment,
      depends_on: { [`db-${name}`]: { condition: 'service_healthy' }, rabbitmq: { condition: 'service_healthy' } },
      healthcheck: { test: ['CMD', 'wget', '-qO-', 'http://localhost:3000/api/health/live'], interval: '15s', timeout: '5s', retries: 10, start_period: '90s' },
      ...(name === 'compras' ? { volumes: ['comprobantes:/data/comprobantes'] } : {}),
    };
  }
  services['pwa-cliente'] = { ...common, image: images.at(-2), healthcheck: { test: ['CMD', 'wget', '-qO-', 'http://127.0.0.1:8080/'], interval: '15s', timeout: '5s', retries: 5 } };
  services['bootstrap-admin'] = {
    image: images[0], profiles: ['ops'],
    environment: { DATABASE_URL: services['servicio-identidad'].environment.DATABASE_URL, PLATFORM_ADMIN_EMAIL: '${PLATFORM_ADMIN_EMAIL:?Falta PLATFORM_ADMIN_EMAIL}', PLATFORM_ADMIN_PASSWORD: '${PLATFORM_ADMIN_PASSWORD:?Falta PLATFORM_ADMIN_PASSWORD}' },
    entrypoint: ['node', '/usr/src/app/ops/bootstrap-admin.cjs'],
    depends_on: { 'db-identidad': { condition: 'service_healthy' } },
  };
  services.kong = {
    ...common, image: images.at(-1),
    ports: ['127.0.0.1:${GATEWAY_PORT:-18000}:8000'],
    environment: {
      KONG_DATABASE: 'off', KONG_HEADERS: 'off', KONG_ADMIN_LISTEN: '127.0.0.1:8001', KONG_PROXY_LISTEN: '0.0.0.0:8000',
      KONG_PLUGINS: 'bundled,jwt-cache', KONG_JWT_PUBLIC_KEY: '${JWT_PUBLIC_KEY:?Falta JWT_PUBLIC_KEY}',
      KONG_CORS_ORIGINS: '${KONG_CORS_ORIGINS:?Falta KONG_CORS_ORIGINS}', KONG_RATE_LIMIT_MINUTE: '${KONG_RATE_LIMIT_MINUTE:-3000}', KONG_RATE_LIMIT_HOUR: '${KONG_RATE_LIMIT_HOUR:-30000}',
      KONG_NGINX_HTTP_LUA_SHARED_DICT: 'jwt_cache 12m', KONG_DNS_VALID_TTL: '10',
      KONG_PROXY_ACCESS_LOG: '/dev/stdout', KONG_PROXY_ERROR_LOG: '/dev/stderr',
    },
    depends_on: { 'pwa-cliente': { condition: 'service_healthy' } },
    healthcheck: { test: ['CMD', 'kong', 'health'], interval: '15s', timeout: '5s', retries: 10, start_period: '30s' },
  };
  services.backup = {
    ...common, image: RUNTIME_IMAGES[0], profiles: ['backup'],
    environment: { DB_USER: '${DB_USER:-restoapp}', DB_PASS: '${DB_PASS:?Falta DB_PASS}' },
    volumes: ['./ops:/ops:ro', 'backups:/backups', 'comprobantes:/data/comprobantes:ro'],
    entrypoint: ['sh', '/ops/backup.sh'],
  };
  return { name: '${COMPOSE_PROJECT_NAME:-restoapp-vps}', services, volumes };
}

export function nginxConfig(domain) {
  domain = validateDomain(domain);
  return `# Install inside nginx http context (sites-available on Debian/Ubuntu).
# The existing website at mavricitas.com keeps its own server block.
server {
    listen 80;
    server_name ${domain} *.${domain};
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    server_name ${domain} *.${domain};
    ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 16m;
    location / {
        proxy_pass http://127.0.0.1:18000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 90s;
        proxy_send_timeout 90s;
        proxy_buffering off;
    }
}
`;
}

/** Attach only the gateway to the network already used by the existing Caddy. */
export function caddyComposeConfig() {
  return {
    services: { kong: { networks: { default: {}, caddy_proxy: { aliases: ['restoapp-gateway'] } } } },
    networks: { caddy_proxy: { external: true, name: '${CADDY_NETWORK:?Indica la red existente de agendly-caddy}' } },
  };
}

export function caddyConfig(domain, certificateMode = 'files') {
  domain = validateDomain(domain);
  if (!['files', 'cloudflare'].includes(certificateMode)) throw new Error('Modo de certificado Caddy inválido');
  const tls = certificateMode === 'cloudflare'
    ? 'tls {\n        dns cloudflare {env.CLOUDFLARE_API_TOKEN}\n    }'
    : 'tls /etc/caddy/restoapp-tls/fullchain.pem /etc/caddy/restoapp-tls/privkey.pem';
  return `# Add as a new site block in the existing Caddy configuration.\n# Requires docker-compose.caddy.yml and the existing proxy network.\n${domain}, *.${domain} {\n    ${tls}\n    reverse_proxy restoapp-gateway:8000\n}\n`;
}

export function envTemplate(domain) {
  domain = validateDomain(domain);
  // Kong treats origins as regexes; escape dots and anchor both ends.
  const originRegex = `^https://[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.${domain.replaceAll('.', '\\.')}$`;
  return `# Generated template only. Generate real secrets with ops/init-env.mjs on the VPS.
COMPOSE_PROJECT_NAME=restoapp-vps
TENANT_BASE_DOMAIN=${domain}
TENANT_ROOT_DOMAINS=${domain}
CORS_ORIGIN=https://${domain},https://*.${domain}
KONG_CORS_ORIGINS='${JSON.stringify([`https://${domain}`, originRegex])}'
GATEWAY_PORT=18000
DB_USER=restoapp
DB_PASS=REPLACE_ME
RABBITMQ_USER=restoapp
RABBITMQ_PASS=REPLACE_ME
JWT_PRIVATE_KEY=REPLACE_ME
JWT_PUBLIC_KEY=REPLACE_ME
SERVICE_JWT_SECRET=REPLACE_ME
FACTURACION_CRED_ENCRYPTION_KEY=REPLACE_ME
# Existing fiscal data requires its ORIGINAL encryption key, not a new one.
# Keep SUNAT beta until the business configures its production credentials.
SUNAT_WSDL_URL=https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService?wsdl
PLATFORM_ADMIN_EMAIL=REPLACE_ME
PLATFORM_ADMIN_PASSWORD=REPLACE_ME
`;
}
