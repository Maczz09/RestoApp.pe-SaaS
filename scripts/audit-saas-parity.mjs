import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const source = resolve(option('--source', 'D:/Restaurantes/la-barra-del-ceviche'));
const target = resolve(option('--target', '.'));
const output = resolve(option('--output', 'artifacts/parity-20261114/inventory.json'));
const ignore = new Set(['node_modules', 'generated', 'dist', 'coverage', 'test-output', '.git']);
const files = [];
function walk(root, path) {
  if (!existsSync(path)) return;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (ignore.has(entry.name)) continue;
    const full = resolve(path, entry.name);
    if (entry.isDirectory()) walk(root, full);
    else if (/\.(?:tsx?|prisma|sql|css)$/.test(entry.name) && !/\.(?:spec|test|eval)\./.test(entry.name)) files.push(relative(root, full).replaceAll('\\', '/'));
  }
}
for (const project of readdirSync(resolve(source, 'apps'), { withFileTypes: true })) {
  if (!project.isDirectory() || (project.name !== 'pwa-cliente' && !project.name.startsWith('servicio-'))) continue;
  walk(source, resolve(source, 'apps', project.name, 'src'));
  if (project.name.startsWith('servicio-')) walk(source, resolve(source, 'apps', project.name, 'prisma'));
}
walk(source, resolve(source, 'libs/contracts/src/domains'));
const hash = file => createHash('sha256').update(readFileSync(file, 'utf8').replaceAll('\r\n', '\n')).digest('hex');
const inventory = [...new Set(files)].sort().map(path => ({ path, status: !existsSync(resolve(target, path)) ? 'missing' : hash(resolve(source, path)) === hash(resolve(target, path)) ? 'identical' : 'different' }));
const revision = root => { try { return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return null; } };
const result = { createdAt: new Date().toISOString(), source, target, sourceRevision: revision(source), targetRevision: revision(target), caveat: 'File differences require semantic review; identical files are not proof of runtime parity or tenant isolation.', counts: Object.fromEntries(['identical', 'different', 'missing'].map(s => [s, inventory.filter(f => f.status === s).length])), files: inventory };
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ output, counts: result.counts, missing: inventory.filter(f => f.status === 'missing').map(f => f.path) }, null, 2));
