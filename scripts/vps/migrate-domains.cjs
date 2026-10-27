const { Pool } = require('pg');
const { randomUUID } = require('node:crypto');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const RESERVED = new Set(['admin', 'api', 'app', 'platform', 'superadmin', 'www']);
function planMigration(tenants, domains, from, to) {
  const valid = (host) => typeof host === 'string' && host.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host);
  if (!valid(from) || !valid(to) || from === to) throw new Error('Indica dominios origen/destino diferentes y válidos.');
  return tenants.map((tenant) => {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(tenant.slug) || RESERVED.has(tenant.slug)) throw new Error(`Slug no utilizable: ${tenant.slug}. Corregir antes de migrar.`);
    const target = `${tenant.slug}.${to}`;
    if (!valid(target)) throw new Error(`Dominio demasiado largo o inválido: ${target}`);
    const existing = domains.find((row) => row.domain === target);
    if (existing && existing.tenantId !== tenant.id) throw new Error(`Conflicto: ${target} ya pertenece a otro tenant.`);
    const current = domains.filter((row) => row.tenantId === tenant.id);
    const principal = current.find((row) => row.principal);
    const makePrimary = !principal || principal.domain === `${tenant.slug}.${from}`;
    return { tenantId: tenant.id, slug: tenant.slug, target, existingId: existing?.id ?? null, makePrimary, before: current };
  });
}
exports.planMigration = planMigration;

async function main() {
  const args = process.argv.slice(2);
  const option = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
  const from = option('--from', 'restoapp.pe');
  const to = option('--to', process.env.TENANT_BASE_DOMAIN);
  const apply = args.includes('--apply');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('restoapp-domain-migration'))");
    const tenants = (await client.query('SELECT id,slug FROM tenants ORDER BY id')).rows;
    const domains = (await client.query('SELECT * FROM tenant_domains ORDER BY id FOR UPDATE')).rows;
    if (domains.length > 100000) throw new Error('Más de 100000 dominios: requiere aprobar el volumen del snapshot antes de aplicar.');
    const plan = planMigration(tenants, domains, from, to);
    const report = { mode: apply ? 'apply' : 'dry-run', from, to, plannedAt: new Date().toISOString(), tenants: plan.length, plan };
    const dir = process.env.REPORT_DIR || '/tmp/restoapp-domain-migration';
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const path = join(dir, `${apply ? 'apply' : 'preview'}-${Date.now()}.json`);
    writeFileSync(path, JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(`${apply ? 'Snapshot previo' : 'Vista previa'}: ${path}`);
    if (apply) {
      for (const item of plan) {
        // Clear primary first to respect the partial unique index. Keep aliases.
        if (item.makePrimary) await client.query('UPDATE tenant_domains SET principal=false,"updatedAt"=now() WHERE "tenantId"=$1 AND principal=true', [item.tenantId]);
        if (item.existingId) await client.query('UPDATE tenant_domains SET activo=true,principal=CASE WHEN $2 THEN true ELSE principal END,"updatedAt"=now() WHERE id=$1', [item.existingId, item.makePrimary]);
        else await client.query('INSERT INTO tenant_domains (id,"tenantId",domain,activo,principal,"createdAt","updatedAt") VALUES ($1,$2,$3,true,$4,now(),now())', [randomUUID(), item.tenantId, item.target, item.makePrimary]);
        await client.query('INSERT INTO "AuditoriaLog" (id,"tenantId",accion,"usuarioId",servicio,recurso,"recursoId",detalle,resultado,"createdAt") VALUES ($1,$2,$3,$4,$5,$6,$2,$7,$8,now())', [randomUUID(), item.tenantId, 'TENANT_DOMINIO_MIGRADO_VPS', 'deployment', 'servicio-identidad', 'TenantDomain', JSON.stringify({ from, to, domain: item.target, snapshot: path }), 'OK']);
      }
      await client.query('COMMIT');
    } else await client.query('ROLLBACK');
    console.log(`${apply ? 'Aplicado' : 'Simulación'}: ${plan.length} tenants. Dominios anteriores y dominios propios conservados.`);
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); await pool.end(); }
}
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
