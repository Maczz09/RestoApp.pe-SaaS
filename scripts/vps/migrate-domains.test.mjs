import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { planMigration } = createRequire(import.meta.url)('./migrate-domains.cjs');
const tenant = { id: 'tenant-1', slug: 'cevicheria' };

test('migration changes primary managed domain while preserving its old alias', () => {
  const old = { id: 'old', tenantId: tenant.id, domain: 'cevicheria.restoapp.pe', principal: true };
  const plan = planMigration([tenant], [old], 'restoapp.pe', 'restoapp.mavricitas.com');
  assert.equal(plan[0].target, 'cevicheria.restoapp.mavricitas.com');
  assert.equal(plan[0].makePrimary, true);
  assert.deepEqual(plan[0].before, [old]);
});

test('migration preserves custom primary domains and recognizes an already migrated tenant', () => {
  const custom = { id: 'custom', tenantId: tenant.id, domain: 'cevicheria.com', principal: true };
  const target = { id: 'existing', tenantId: tenant.id, domain: 'cevicheria.restoapp.mavricitas.com', principal: false };
  const plan = planMigration([tenant], [custom, target], 'restoapp.pe', 'restoapp.mavricitas.com');
  assert.equal(plan[0].makePrimary, false);
  assert.equal(plan[0].existingId, 'existing');
});

test('cross-tenant collisions and unusable slugs abort before writing data', () => {
  assert.throws(() => planMigration([tenant], [{ tenantId: 'other', domain: 'cevicheria.restoapp.mavricitas.com' }], 'restoapp.pe', 'restoapp.mavricitas.com'), /Conflicto/);
  for (const slug of ['admin', 'platform', 'superadmin', 'bad.slug']) assert.throws(() => planMigration([{ ...tenant, slug }], [], 'restoapp.pe', 'restoapp.mavricitas.com'), /Slug/);
  assert.throws(() => planMigration([tenant], [], 'restoapp.pe', 'https://foo.com'));
});
