import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// Real PostgreSQL SQL, in memory. No Docker daemon or external database needed.
// Run both a clean install and an upgrade from the tracked migration history.
const args = process.argv.slice(2), baselineIndex = args.indexOf('--baseline');
const baseline = baselineIndex >= 0 ? args[baselineIndex+1] : 'HEAD';
const services = baselineIndex >= 0 ? args.filter((_,i) => i !== baselineIndex && i !== baselineIndex+1) : args;
const selected = services.length ? services : ['caja', 'cuentas', 'mesas', 'pedidos', 'facturacion', 'inventario', 'compras', 'reservas', 'reportes', 'identidad'];
let failures = 0;
for (const service of selected) {
  const dir = `apps/servicio-${service}/prisma/migrations`;
  if (!existsSync(dir)) continue;
  const paths = readdirSync(dir).sort().map(name => `${dir}/${name}/migration.sql`).filter(existsSync);
  const tracked = new Set(execFileSync('git', ['ls-tree', '-r', '--name-only', baseline, '--', dir], { encoding: 'utf8' }).trim().split(/\r?\n/));
  for (const mode of ['fresh', 'upgrade']) {
    const db = new PGlite();
    const order = mode === 'fresh' ? paths : [...paths.filter(p => tracked.has(p)), ...paths.filter(p => !tracked.has(p))];
    try {
      for (const path of order) {
        try { await db.exec(readFileSync(resolve(path), 'utf8')); }
        catch (error) { throw new Error(`${path}: ${error.message}`); }
      }
      const generated = resolve(`apps/servicio-${service}/src/generated/prisma`);
      if (!existsSync(generated)) throw new Error('Genera primero el cliente Prisma del servicio');
      const { Prisma } = require(generated);
      const { rows } = await db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'");
      const columns = new Set(rows.map(row => `${row.table_name}.${row.column_name}`));
      for (const model of Prisma.dmmf.datamodel.models) for (const field of model.fields.filter(f => f.kind !== 'object')) {
        const column = `${model.dbName ?? model.name}.${field.dbName ?? field.name}`;
        if (!columns.has(column)) throw new Error(`Falta la columna del modelo actual: ${column}`);
      }
      console.log(`PASS ${service} ${mode} (${order.length} migrations)`);
    } catch (error) { failures++; console.error(`FAIL ${service} ${mode}: ${error.message}`); }
    finally { await db.close(); }
  }
}
if (failures) process.exitCode = 1;
