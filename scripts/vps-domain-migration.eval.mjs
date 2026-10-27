import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const option = (key) => { const index = args.indexOf(key); return index < 0 ? undefined : args[index + 1]; };
const project = option('--project');
assert.match(project || '', /^restoapp-vps-qa-/, 'Only disposable QA projects may receive fixtures');
const compose = ['compose', '-p', project, '--env-file', option('--env'), '-f', option('--compose')];
function run(params) {
  const result = spawnSync('docker', [...compose, ...params], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout);
  return result.stdout.trim();
}
function sql(text) { return run(['exec', '-T', 'db-identidad', 'psql', '-X', '-U', 'restoapp', '-d', 'identidad_db', '-v', 'ON_ERROR_STOP=1', '-At', '-c', text]); }
const suffix = randomBytes(4).toString('hex');
const legacy = { id: randomUUID(), slug: `qa-legacy-${suffix}` };
const custom = { id: randomUUID(), slug: `qa-custom-${suffix}` };
const targetRoot = 'restoapp.mavricitas.com';
sql(`BEGIN;
  INSERT INTO tenants (id,nombre,slug,"updatedAt") VALUES ('${legacy.id}','Legacy QA','${legacy.slug}',now()),('${custom.id}','Custom QA','${custom.slug}',now());
  INSERT INTO tenant_domains (id,"tenantId",domain,activo,principal,"updatedAt") VALUES
    ('${randomUUID()}','${legacy.id}','${legacy.slug}.restoapp.pe',true,true,now()),
    ('${randomUUID()}','${custom.id}','${custom.slug}.example.com',true,true,now());
  COMMIT;`);
const command = ['exec', '-T', 'servicio-identidad', 'node', '/usr/src/app/ops/migrate-domains.cjs', '--from', 'restoapp.pe', '--to', targetRoot];
const rows = () => JSON.parse(sql(`SELECT json_agg(d ORDER BY domain) FROM tenant_domains d WHERE "tenantId" IN ('${legacy.id}','${custom.id}')`));
const beforePreview = rows();
console.log(run(command));
assert.deepEqual(rows(), beforePreview);
console.log(run([...command, '--apply']));
const after = rows();
assert.equal(after.filter((row) => row.tenantId === legacy.id).length, 2);
assert.equal(after.find((row) => row.domain === `${legacy.slug}.restoapp.pe`).principal, false);
assert.equal(after.find((row) => row.domain === `${legacy.slug}.${targetRoot}`).principal, true);
assert.equal(after.find((row) => row.domain === `${custom.slug}.example.com`).principal, true);
assert.equal(after.find((row) => row.domain === `${custom.slug}.${targetRoot}`).principal, false);
console.log(run([...command, '--apply']));
assert.deepEqual(rows().map(({ domain, tenantId, principal, activo }) => ({ domain, tenantId, principal, activo })), after.map(({ domain, tenantId, principal, activo }) => ({ domain, tenantId, principal, activo })));
const report = { project, evaluatedAt: new Date().toISOString(), checks: ['preview does not write', 'old managed alias preserved', 'new managed domain becomes primary', 'custom primary preserved', 'repeat application is idempotent'], result: 'PASS' };
if (option('--report')) writeFileSync(option('--report'), JSON.stringify(report, null, 2));
console.log('PASS PostgreSQL migration, alias preservation, custom domains and idempotency');
