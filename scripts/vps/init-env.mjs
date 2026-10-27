import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { envTemplate, DEFAULT_DOMAIN, validateDomain } from './config.mjs';

const args = process.argv.slice(2);
const option = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
const domain = validateDomain(option('--domain', DEFAULT_DOMAIN));
const output = option('--output', '.env.vps');
const email = option('--email', '');
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Indica --email con el correo del superadministrador.');
if (existsSync(output)) throw new Error(`${output} ya existe. No se reemplazan claves ni contraseñas de una instalación existente.`);
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 3072, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const values = {
  DB_PASS: randomBytes(32).toString('hex'), RABBITMQ_PASS: randomBytes(32).toString('hex'),
  SERVICE_JWT_SECRET: randomBytes(48).toString('hex'), FACTURACION_CRED_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  JWT_PRIVATE_KEY: privateKey.trim().replaceAll('\n', '\\n'), JWT_PUBLIC_KEY: publicKey.trim().replaceAll('\n', '\\n'),
  PLATFORM_ADMIN_EMAIL: email.toLowerCase(), PLATFORM_ADMIN_PASSWORD: randomBytes(24).toString('base64url'),
};
let content = envTemplate(domain);
for (const [name, value] of Object.entries(values)) content = content.replace(`${name}=REPLACE_ME`, `${name}='${value}'`);
writeFileSync(output, content, { flag: 'wx', mode: 0o600 });
console.log(`Configuración creada en ${output}. Las credenciales solo se guardan en ese archivo.`);
console.log('Para migrar datos existentes conserva DB_PASS, JWT y FACTURACION_CRED_ENCRYPTION_KEY originales antes de arrancar.');
