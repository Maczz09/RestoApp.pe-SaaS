// Optional isolated PostgreSQL/WASM evaluation, no production connection.
// npm install --prefix <temp-dir> @electric-sql/pglite
// PGLITE_MODULE=<temp-dir>/node_modules/@electric-sql/pglite node scripts/vps/team-memberships.eval.cjs
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE sedes (id text PRIMARY KEY, "tenantId" text);
      CREATE TABLE "Usuario" (id text PRIMARY KEY, "sedeId" text, rol text, activo boolean, password text);
      CREATE TABLE membresias (id text PRIMARY KEY, "tenantId" text, "usuarioId" text, rol text, activo boolean, "createdAt" timestamp, "updatedAt" timestamp, UNIQUE("tenantId", "usuarioId"));
      CREATE TABLE membresias_sedes (id text PRIMARY KEY, "membresiaId" text REFERENCES membresias(id), "sedeId" text REFERENCES sedes(id), "createdAt" timestamp);
      CREATE TABLE "AuditoriaLog" (id text PRIMARY KEY, "tenantId" text, accion text, "usuarioId" text, servicio text, resultado text, "createdAt" timestamp);
      INSERT INTO sedes VALUES ('a','tenant-a'), ('b','tenant-b'), ('legacy',null);
      INSERT INTO "Usuario" VALUES ('orphan-a','a','MESERO',true,'unchanged'), ('orphan-b','b','COCINA',false,'unchanged'), ('disabled','a','MESERO',true,'unchanged'), ('foreign','a','MESERO',true,'unchanged'), ('no-branch',null,'ADMIN',true,'unchanged'), ('platform','a','PLATFORM_ADMIN',true,'unchanged'), ('legacy','legacy','MESERO',true,'unchanged');
      INSERT INTO membresias VALUES ('disabled-m','tenant-a','disabled','MESERO',false,now(),now()), ('foreign-m','tenant-b','foreign','MESERO',true,now(),now());
    `);
    const sql = readFileSync(resolve(__dirname, '../../apps/servicio-identidad/prisma/migrations/20261114090000_repair_team_memberships/migration.sql'), 'utf8');
    await db.exec(sql);
    const rows = (await db.query('SELECT "usuarioId", "tenantId", activo FROM membresias ORDER BY "usuarioId"')).rows;
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.find(r => r.usuarioId === 'orphan-a'), { usuarioId: 'orphan-a', tenantId: 'tenant-a', activo: true });
    assert.deepEqual(rows.find(r => r.usuarioId === 'orphan-b'), { usuarioId: 'orphan-b', tenantId: 'tenant-b', activo: false });
    assert.equal(rows.find(r => r.usuarioId === 'disabled').activo, false);
    assert.equal(rows.find(r => r.usuarioId === 'foreign').tenantId, 'tenant-b');
    assert.equal((await db.query('SELECT * FROM membresias_sedes')).rows.length, 2);
    assert.equal((await db.query('SELECT * FROM "AuditoriaLog"')).rows.length, 2);
    assert.ok((await db.query('SELECT password FROM "Usuario"')).rows.every(r => r.password === 'unchanged'));
    await db.exec(sql);
    assert.equal((await db.query('SELECT * FROM membresias')).rows.length, 4);
    assert.equal((await db.query('SELECT * FROM "AuditoriaLog"')).rows.length, 2);
    console.log('PASS: tenant/branch association, disabled and foreign memberships preserved, privileged/unassigned accounts skipped, passwords unchanged, audit, idempotence.');
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
