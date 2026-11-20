import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), dotenv = require('dotenv'), forge = require('node-forge'), axios = require('axios');
const args = process.argv.slice(2);
const opt = name => args[args.indexOf(name) + 1];
const project = opt('--project'), envFile = opt('--env'), base = new URL(opt('--base'));
assert.match(project ?? '', /^restoapp-vps-qa-/);
assert(['127.0.0.1', 'localhost'].includes(base.hostname), 'Local QA only');
const env = dotenv.parse(readFileSync(envFile));
const container = spawnSync('docker', ['ps', '-q', '--filter', `label=com.docker.compose.project=${project}`, '--filter', 'label=com.docker.compose.service=kong'], { encoding: 'utf8' });
assert.equal(container.status, 0); assert(container.stdout.trim(), 'QA gateway must be running');
const inspected = spawnSync('docker', ['inspect', container.stdout.trim()], { encoding: 'utf8' });
const gateway = JSON.parse(inspected.stdout)[0];
assert(gateway.NetworkSettings.Ports['8000/tcp'].some(p => p.HostPort === base.port), 'The URL must point to the QA project');
const domain = env.TENANT_BASE_DOMAIN, root = { host: domain };
const cases = [], suffix = randomBytes(3).toString('hex'), password = randomBytes(20).toString('base64url');
const mock = () => fetch('http://127.0.0.1:18190/calls').then(r => r.json());
const initialSunatCount = (await mock()).count;
function pass(name) { cases.push(name); console.log(`PASS ${name}`); }
async function api(actor, path, method = 'GET', data, accepted) {
  const form = data instanceof FormData;
  // Node 24 fetch drops a custom Host header. Axios's HTTP adapter preserves it,
  // which is essential for testing nested tenant domains against a local port.
  const response = await axios({ url: new URL(`/v1${path}`, base).href, method, headers: { Host: actor.host, ...(actor.token ? { Authorization: `Bearer ${actor.token}` } : {}), ...(!form && data !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(data !== undefined ? { data: form ? data : JSON.stringify(data) } : {}), timeout:25_000, validateStatus:()=>true, responseType:'text', transformResponse:[value=>value] });
  const text = response.data; let value;
  try { value = JSON.parse(text); } catch { value = text; }
  if (accepted) assert(accepted.includes(response.status), `${method} ${path}: ${response.status} ${text.slice(0, 500)}`);
  else assert(response.status >= 200 && response.status < 300, `${method} ${path}: ${response.status} ${text.slice(0, 500)}`);
  return value;
}
async function eventually(fn, label, timeout = 120_000) {
  const until = Date.now() + timeout; let last;
  while (Date.now() < until) {
    try { const result = await fn(); if (result) return result; } catch (error) { last = error; }
    await new Promise(r => setTimeout(r, 750));
  }
  throw new Error(`${label}: ${last?.message ?? 'timeout'}`);
}
async function login(host, email, key) {
  const result = await api({ host }, '/identidad/auth/login', 'POST', { email, password: key });
  assert(result.access_token); return { host, token: result.access_token };
}
Object.assign(root, await login(domain, env.PLATFORM_ADMIN_EMAIL, env.PLATFORM_ADMIN_PASSWORD));
const plans = await api(root, '/identidad/platform/plans');
const plan = plans.find(p => p.activo) ?? await api(root, '/identidad/platform/plans', 'POST', { code: `QA_${suffix.toUpperCase()}`, nombre: 'Plan QA', priceCents: 100, cycleDays: 30, activo: true });
const tenants = [];
for (const name of ['a', 'b']) {
  const slug = `qa-v2-${name}-${suffix}`, email = `${slug}@example.test`;
  const created = await api(root, '/identidad/platform/tenants', 'POST', { nombre: `Restaurante QA ${name}`, slug, plan: plan.code, sede: { nombre: `Local QA ${name}` }, administrador: { nombre: `Administrador QA ${name}`, email, password } });
  const actor = await login(`${slug}.${domain}`, email, password);
  const location = await api(actor, '/mesas/ubicaciones', 'POST', { nombre: 'Salón QA' });
  const zone = location.ubicacion ?? location;
  const table = await api(actor, '/mesas', 'POST', { numero: 1, capacidad: 4, ubicacionId: zone.id });
  tenants.push({ ...actor, id: created.tenant.id, sedeId: created.sede.id, zone, mesa: table.mesa ?? table });
}
const [a,b] = tenants;
await api(a, `/mesas/${b.mesa.id}`, 'GET', undefined, [403,404]);
await api(a, '/mesas/unir', 'POST', { mesaIds: [a.mesa.id,b.mesa.id] }, [403,404]);
pass('Dos tenants, login y aislamiento de mesas y unión antigua');
const staffEmail = `mozo-${suffix}@example.test`;
await api(a, '/identidad/usuarios', 'POST', { nombre: 'Mozo QA', email: staffEmail, password, rol: 'MESERO', sedeId: a.sedeId });
const waiter = await login(a.host, staffEmail, password);
pass('Usuario del restaurante creado e inicio de sesión del mesero');
const categoryResponse = await api(a, '/inventario/categorias', 'POST', { nombre: 'Platos QA', area: 'COCINA' });
const category = categoryResponse.categoria ?? categoryResponse;
const products = [];
for (const price of [50,70,30]) {
  const result = await api(a, '/inventario/productos', 'POST', { categoriaId: category.id, nombre: `Plato QA ${price}`, precio: price, disponible: true });
  products.push(result.producto ?? result);
}
async function table(number) { const result = await api(a, '/mesas', 'POST', { numero: number, capacidad: 4, ubicacionId: a.zone.id }); return result.mesa ?? result; }
async function order(mesaId, items) { const result = await api(waiter, '/pedidos', 'POST', { mesaId, items }); return result.pedido ?? result; }
async function account(mesaId, expected) {
  return eventually(async () => {
    const c = await api(a, `/cuentas/mesa/${mesaId}`, 'GET', undefined, [200,404]);
    if (c.total !== expected || c.estado !== 'ABIERTA') return null;
    const mesa = await api(a, `/mesas/${mesaId}`);
    return mesa.estado === 'OCUPADA' && mesa.cuentaAsociada === c.id ? c : null;
  }, `Cuenta ${expected}`);
}
const segunda = await table(2);
const first = await order(a.mesa.id, [{ productoId: products[0].id, cantidad: 1, notas: 'Parte pierna' }, { productoId: products[0].id, cantidad: 1, notas: 'Sin ají' }]);
assert.equal(first.items.length, 2); assert.deepEqual(first.items.map(i => i.notas).sort(), ['Parte pierna','Sin ají']);
await order(segunda.id, [{ productoId: products[1].id, cantidad: 1 }]);
const account1 = await account(a.mesa.id, 100); await account(segunda.id,70);
await api(waiter, `/pedidos/items/${first.items[0].id}/estado`, 'PATCH', { estado: 'EN_PREPARACION' });
await api(waiter, `/pedidos/items/${first.items[0].id}/estado`, 'PATCH', { estado: 'LISTO' });
await eventually(async () => { const c = await account(a.mesa.id,100); return c.pedidos.some(p => p.items.some(i => i.id === first.items[0].id && i.estado === 'LISTO')); }, 'Plato listo en snapshot');
pass('Notas independientes y actualización de un plato sin completar todo el pedido');
let fusion = await api(a, '/mesas/fusiones', 'POST', { mesaIds: [a.mesa.id, segunda.id], maestraMesaId: a.mesa.id });
await eventually(async () => { const result = await api(a, `/mesas/${segunda.id}`); return result.grupoId === a.mesa.id; }, 'Unión de mesas');
assert.equal((await account(a.mesa.id,170)).total, 170);
await order(segunda.id, [{ productoId: products[2].id, cantidad: 1, notas: 'Pedido después de unir' }]);
const joined = await account(a.mesa.id,200);
assert.equal(joined.id, account1.id);
pass('Unión de mesas ocupadas, suma exacta y nueva comanda desde mesa secundaria');
await api(waiter, `/cuentas/${joined.id}/solicitar-cuenta`, 'POST', {});
await api(waiter, `/cuentas/${joined.id}/solicitar-cuenta`, 'POST', {});
const requests = await api(a, '/cuentas/solicitudes-cuenta');
assert.equal(requests.length, 1); assert.deepEqual(requests[0].numerosMesa, [1,2]);
pass('Solicitud de cuenta idempotente e identificación del grupo unido');
await api(a, '/caja/turnos/abrir', 'POST', { fondoInicial: 0 });
const mixed = await api(a, '/caja/pagos/combinado', 'POST', { cuentaId: joined.id, tipoComprobante: 'TICKET', pagos: [{ metodo: 'TARJETA', monto: 100 }, { metodo: 'EFECTIVO', monto: 60 }, { metodo: 'YAPE', monto: 40 }] });
assert.equal(mixed.pendiente,0); assert.equal(mixed.ticket.total,200); assert.equal(mixed.ticket.medios.length,3);
assert.equal(mixed.ticket.serie,'TI01');
await eventually(async () => (await api(a, `/mesas/${segunda.id}`)).estado === 'LIBRE', 'Liberación del grupo');
assert.equal((await api(a, '/cuentas/solicitudes-cuenta')).length, 0);
assert.equal((await mock()).count,initialSunatCount);
pass('S/200 con tres medios, ticket propio sin SUNAT, cierre y liberación de todo el grupo');
const cardTransaction = mixed.ticket.medios.find(m => m.metodo === 'TARJETA').transaccionId;
assert(cardTransaction);
await api(a,`/caja/${cardTransaction}`,'PATCH',{metodo:'TRANSFERENCIA'});
const correctedTicket = await api(a,`/caja/transacciones/${cardTransaction}/ticket`);
assert.equal(correctedTicket.medios.find(m => m.transaccionId === cardTransaction).metodo,'TRANSFERENCIA');
assert.equal(correctedTicket.total,200);
pass('Corrección del medio conserva el documento y actualiza el arqueo');

// A real PKCS#12 and XML signature; the isolated SOAP simulator replaces SUNAT.
const keys = forge.pki.rsa.generateKeyPair(2048), cert = forge.pki.createCertificate();
cert.publicKey = keys.publicKey; cert.serialNumber = '01'; cert.validity.notBefore = new Date(Date.now()-60_000); cert.validity.notAfter = new Date(Date.now()+86_400_000);
const attrs = [{ name: 'commonName', value: 'Emisor QA' }]; cert.setSubject(attrs); cert.setIssuer(attrs); cert.sign(keys.privateKey, forge.md.sha256.create());
const pfx = Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey,[cert],password,{ algorithm:'3des' })).getBytes(),'binary');
for (const ruc of ['20123456789','20987654321','20111111111']) {
  const form = new FormData();
  for (const [key,value] of Object.entries({ ruc, sedeId:a.sedeId, razonSocial:'EMISOR QA SAC', direccion:'Lima', ubigeo:'150101', solUsuario:'MODDATOS', solClave:'MODDATOS', certificadoPass:password })) form.set(key,value);
  form.set('certificado',new Blob([pfx]),'qa.p12');
  await api(a,'/facturacion/empresas','POST',form);
}
assert.equal((await api(a,'/facturacion/empresas')).length,3);
pass('Tres emisores SUNAT en la misma sede con certificados cifrados');
const tercero = await table(3);
await order(tercero.id,[{ productoId:products[0].id,cantidad:2 }]);
const divided = await account(tercero.id,100);
await api(b,`/caja/division-cuenta/${divided.id}`,'GET',undefined,[403,404]);
let split = await api(a,`/caja/division-cuenta/${divided.id}`,'PATCH',{ modo:'PARTES',numPartes:3,descuento:0,propina:0 });
assert.deepEqual(split.partes.map(p=>p.monto),[33.33,33.33,33.34]);
const docTypes = ['TICKET','BOLETA','FACTURA'];
for (let i=0;i<split.partes.length;i++) {
  const part=split.partes[i], tipo=docTypes[i] ?? 'TICKET';
  await api(a,'/caja/pagos','POST',{ cuentaId:divided.id,montoRecibido:part.monto,metodo:'EFECTIVO',tipoComprobante:tipo,divisionPlanId:split.id,divisionParteId:part.id,divisionVersion:split.version, ...(tipo==='TICKET'?{}:{empresaRuc:'20123456789'}), ...(tipo==='FACTURA'?{clienteDocumento:'20999999999',clienteRazonSocial:'CLIENTE QA SAC'}:{}) });
  const restored = await api(a,`/caja/division-cuenta/${divided.id}`);
  assert.equal(restored.partes.filter(p=>p.pagada).length,i+1);
  if(i===0) {
    await order(tercero.id,[{productoId:products[2].id,cantidad:1,notas:'Consumo después del primer pago'}]);
    await account(tercero.id,130);
    split = await api(a,`/caja/division-cuenta/${divided.id}/ampliar`,'POST',{version:split.version});
    assert.equal(split.partes[0].id,part.id); assert.equal(split.partes[0].pagada,true);
    assert.equal(split.partes[0].monto,33.33); assert.equal(split.partes.at(-1).monto,30);
    assert.equal(split.total,130);
    pass('Nuevos consumos amplían la división sin alterar la primera parte pagada');
  }
  if(i<split.partes.length-1) assert.equal((await api(a,`/mesas/${tercero.id}`)).estado,'OCUPADA');
}
await eventually(async()=> (await api(a,`/mesas/${tercero.id}`)).estado==='LIBRE','Última parte libera mesa');
pass('División persistente entre tres con céntimos exactos y documentos independientes');
await eventually(async()=> {
  const all=await api(a,'/facturacion/comprobantes-pago/todos');
  return all.filter(c=>c.cuentaOrigenId===divided.id && c.comprobante?.estado==='ACEPTADO').length===2;
},'Boleta y factura firmadas con CDR aceptado',150_000);
assert.equal((await mock()).count,initialSunatCount+2);
pass('Outbox de emisión, XML firmado, SOAP y lectura del CDR sin SUNAT real');
const cuarta = await table(4);
await order(cuarta.id,[{ productoId:products[0].id,cantidad:1,notas:'Uno' },{productoId:products[0].id,cantidad:1,notas:'Dos'}]);
const itemAccount=await account(cuarta.id,100);
const items=itemAccount.pedidos.flatMap(p=>p.items);
const itemPlan=await api(a,`/caja/division-cuenta/${itemAccount.id}`,'PATCH',{modo:'ITEMS',numPartes:2,descuento:0,propina:0,asignaciones:{[`${items[0].id}:0`]:1,[`${items[1].id}:0`]:2}});
for (const part of itemPlan.partes) await api(a,'/caja/pagos','POST',{cuentaId:itemAccount.id,montoRecibido:part.monto,metodo:'YAPE',tipoComprobante:'TICKET',divisionPlanId:itemPlan.id,divisionParteId:part.id,divisionVersion:itemPlan.version});
await eventually(async()=> (await api(a,`/mesas/${cuarta.id}`)).estado==='LIBRE','División por platos');
const summary=await api(a,'/caja/turnos/activo/resumen');
assert.equal(summary.totalVentas,430);
assert.equal(Object.values(summary.porMetodo).reduce((s,n)=>s+n,0),430);
assert.equal(summary.porMetodo.TRANSFERENCIA,100);
pass('División por unidades y arqueo final S/430 desglosado por medios');
const output=opt('--output') ?? `${envFile}.eval.json`;
writeFileSync(output,JSON.stringify({at:new Date().toISOString(),project,cases,scope:'Local QA containers; SOAP SUNAT simulated; no production writes'},null,2));
console.log(`Evidence: ${output}`);
