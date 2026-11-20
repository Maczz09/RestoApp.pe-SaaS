import { expect, test, type Page } from '@playwright/test';

// Browser acceptance tests with deterministic API fixtures. No live restaurant
// data or credentials. Backend accounting is covered by the service evals.
async function restaurant(page: Page, rol: 'MESERO' | 'CAJERO', occupied = true) {
  const now = new Date().toISOString();
  const sede = { id: 'sede', nombre: 'Local de prueba', activa: true };
  const mesa = { id: 'mesa', numero: 1, capacidad: 4, ubicacion: 'Salón', sedeId: sede.id, estado: occupied ? 'OCUPADA' : 'LIBRE', cuentaAsociada: occupied ? 'cuenta' : null, createdAt: now, updatedAt: now };
  const user = { id: 'personal', nombre: 'Personal de prueba', email: 'test@example.test', rol, sedeId: sede.id, activeSedeId: sede.id, activeTenantId: 'tenant', tenants: [{ rol, tenant: { id: 'tenant', nombre: 'Restaurante de prueba', slug: 'prueba', activo: true }, sedes: [sede] }] };
  const cuenta = { id: 'cuenta', mesaId: 'mesa', estado: 'ABIERTA', total: 200, createdAt: now, updatedAt: now, pedidos: [{ id: 'pedido', mesaId: 'mesa', estado: 'ENTREGADO', canal: 'SALON', total: 200, createdAt: now, items: [{ id: 'plato', productoId: 'cabrito', nombre: 'Cabrito', cantidad: 2, precioUnitario: 100, estado: 'ENTREGADO', notas: 'Sin ají' }] }] };
  const payments: any[] = [];
  await page.context().addCookies([{ name: 'restoapp.csrf_token', value: 'test-only', url: 'http://localhost:4200' }]);
  await page.route('**/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/v1', '');
    let body: unknown = [];
    if (path === '/identidad/auth/me') body = user;
    else if (path === '/identidad/auth/refresh') body = { access_token: 'test-only' };
    else if (path === '/identidad/sedes/actual') body = { sede };
    else if (path === '/identidad/sedes') body = { sedes: [sede] };
    else if (path === '/mesas/ubicaciones') body = [{ id: 'zona', nombre: 'Salón', sedeId: sede.id }];
    else if (path === '/mesas') body = { mesas: [mesa] };
    else if (path === '/cuentas/mesa/mesa') {
      if (!occupied) return route.fulfill({ status: 404, json: { message: 'Sin cuenta' } });
      body = cuenta;
    } else if (path === '/caja/division-cuenta/cuenta') body = null;
    else if (path === '/caja/turnos/activo/resumen') body = { turno: { id: 'turno', estado: 'ABIERTA', fondoInicial: 0, abiertoAt: now }, movimientos: [], ventas: [], ventasDetalle: [], totalVentas: 0, totalEgresos: 0, totalIngresos: 0, propinas: 0, porMetodo: {}, efectivoEsperado: 0, comprobantes: 0, pendientes: 0 };
    else if (path === '/caja/pagos/combinado') {
      const payload = route.request().postDataJSON(); payments.push(payload);
      body = { pendiente: 0, documento: { tipo: 'TICKET', estado: 'INTERNO' }, transaccion: { id: 'tx', cuentaId: 'cuenta', monto: 200, metodo: 'YAPE', tipoComprobante: 'TICKET', createdAt: now }, ticket: { id: 'ticket', cuentaId: 'cuenta', mesaId: 'mesa', items: cuenta.pedidos[0].items, subtotal: 200, descuento: 0, total: 200, fecha: now, serie: 'TI01', correlativo: 1, medios: payload.pagos.map((p: any) => ({ ...p, propina: 0 })) } };
    } else if (path === '/inventario/productos') body = { data: [], nextCursor: null };
    await route.fulfill({ json: body });
  });
  return payments;
}

test('mesa libre abre directamente la comanda en la vista del mesero', async ({ page }) => {
  await restaurant(page, 'MESERO', false);
  await page.goto('/app/mesas');
  await page.locator('.mesa-tile').click();
  await expect(page.getByRole('dialog', { name: /Nuevo pedido/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Nuevo pedido.*Mesa 01/ })).toBeVisible();
});

test('caja cobra sin solicitud previa, exige documento y combina tres medios', async ({ page }, info) => {
  const payments = await restaurant(page, 'CAJERO');
  await page.goto('/app/caja?mesaId=mesa');
  const modal = page.getByRole('dialog', { name: 'Cobrar cuenta', exact: true });
  await expect(modal).toBeVisible();
  const confirm = modal.getByRole('button', { name: /Registrar pago y cerrar cuenta/ });
  await expect(confirm).toBeDisabled();
  await modal.getByRole('button', { name: 'Ticket interno', exact: true }).click();
  await modal.getByRole('button', { name: 'Combinar métodos' }).click();
  await modal.getByLabel('Monto Efectivo', { exact: true }).fill('60');
  await modal.getByLabel('Monto Tarjeta', { exact: true }).fill('100');
  await expect(confirm).toBeDisabled();
  await modal.getByLabel('Monto Yape', { exact: true }).fill('40');
  await expect(confirm).toBeEnabled();
  await page.screenshot({ path: info.outputPath('cobro-mixto.png'), fullPage: true });
  await confirm.click();
  await expect(modal.getByText('TI01-00000001')).toBeVisible();
  await expect(modal.getByText('No válido como comprobante de pago')).toBeVisible();
  expect(payments).toHaveLength(1);
  expect(payments[0]).toMatchObject({ tipoComprobante: 'TICKET', documentoV2: true, pagos: [{ metodo: 'EFECTIVO', monto: 60 }, { metodo: 'TARJETA', monto: 100 }, { metodo: 'YAPE', monto: 40 }] });
});

test('el cobro en tablet conserva los controles y permite confirmar sin desbordar', async ({page}) => {
  await page.setViewportSize({width:768,height:1024});
  const payments=await restaurant(page,'CAJERO');
  await page.goto('/app/caja?mesaId=mesa');
  const modal=page.getByRole('dialog',{name:'Cobrar cuenta',exact:true});
  await expect(modal).toBeVisible();
  await modal.getByRole('button',{name:'Ticket interno',exact:true}).click();
  await modal.getByRole('button',{name:'Combinar métodos'}).click();
  await modal.getByLabel('Monto Efectivo',{exact:true}).fill('100');
  await modal.getByLabel('Monto Tarjeta',{exact:true}).fill('100');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  const confirm=modal.getByRole('button',{name:/Registrar pago y cerrar cuenta/});
  await confirm.scrollIntoViewIfNeeded(); await expect(confirm).toBeVisible();
  await confirm.click();
  await expect(modal.getByText('TI01-00000001')).toBeVisible();
  expect(payments).toHaveLength(1);
});
