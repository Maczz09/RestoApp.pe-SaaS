import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from './client';
import {
  addTenantDomain,
  createTenant,
  getPlatformSummary,
  getTenantLiveCash,
  getTenantLiveInventory,
  getTenantLiveReservations,
  listTenants,
  removeTenantDomain,
  setTenantStatus,
  updateTenant,
} from './platform.api';

vi.mock('./client', () => ({
  client: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const tenant = {
  id: 'tenant-1',
  nombre: 'La Prueba',
  slug: 'la-prueba',
  ruc: null,
  plan: 'ESTANDAR',
  activo: true,
  createdAt: '2026-09-22T00:00:00.000Z',
  updatedAt: '2026-09-22T00:00:00.000Z',
  domains: [],
  sedesCount: 1,
  usuariosCount: 1,
  admin: null,
};

describe('platform.api', () => {
  beforeEach(() => vi.clearAllMocks());

  it('consulta el resumen de plataforma', async () => {
    vi.mocked(client.get).mockResolvedValue({ totalTenants: 0 });
    await getPlatformSummary();
    expect(client.get).toHaveBeenCalledWith('/identidad/platform/summary');
  });

  it('consulta observación de caja, reservas e inventario sin permitir escritura', async () => {
    vi.mocked(client.get)
      .mockResolvedValueOnce({ turnosAbiertos: 0, pagosUltimas24h: 0, ingresosUltimas24h: 0, recientes: [] })
      .mockResolvedValueOnce({ total: 0, porEstado: {}, proximas: [] })
      .mockResolvedValueOnce({ productos: 0, agotados: 0, noDisponibles: 0, mermasRecientes: [] });
    await getTenantLiveCash('tenant/1');
    await getTenantLiveReservations('tenant/1');
    await getTenantLiveInventory('tenant/1');
    expect(client.get).toHaveBeenNthCalledWith(1, '/caja/platform/tenants/tenant%2F1/live', { cache: 'no-store' });
    expect(client.get).toHaveBeenNthCalledWith(2, '/reservas/platform/tenants/tenant%2F1/live', { cache: 'no-store' });
    expect(client.get).toHaveBeenNthCalledWith(3, '/inventario/platform/tenants/tenant%2F1/live', { cache: 'no-store' });
    expect(client.post).not.toHaveBeenCalled();
  });

  it('rechaza una respuesta cruzada de otro microservicio antes de guardarla en caché', async () => {
    vi.mocked(client.get).mockResolvedValue({ turnosAbiertos: 1, pagosUltimas24h: 0, ingresosUltimas24h: 0, recientes: [] });
    await expect(getTenantLiveReservations('tenant-1')).rejects.toThrow('incompatible');
  });

  it('serializa filtros soportados al listar tenants', async () => {
    vi.mocked(client.get).mockResolvedValue({ data: [tenant], nextCursor: null });
    const response = await listTenants({ search: ' ceviche ', estado: 'suspendidos', plan: 'PRO', limit: 25 });
    expect(client.get).toHaveBeenCalledWith('/identidad/platform/tenants?search=ceviche&estado=SUSPENDIDO&plan=PRO&limit=25');
    expect(response.data[0].domains).toEqual([]);
  });

  it('crea tenant con el contrato de administrador y sede', async () => {
    vi.mocked(client.post).mockResolvedValue(tenant);
    const payload = {
      nombre: 'La Prueba', slug: 'la-prueba', plan: 'ESTANDAR', domain: 'la-prueba.restoapp.pe',
      administrador: { nombre: 'Ana', email: 'ana@prueba.pe', password: 'segura123' },
      sede: { nombre: 'Principal' },
    };
    await createTenant(payload);
    expect(client.post).toHaveBeenCalledWith('/identidad/platform/tenants', payload);
  });

  it('actualiza y suspende un tenant por sus endpoints de plataforma', async () => {
    vi.mocked(client.patch).mockResolvedValue(tenant);
    await updateTenant('tenant 1', { nombre: 'Nuevo nombre' });
    expect(client.patch).toHaveBeenNthCalledWith(1, '/identidad/platform/tenants/tenant%201', { nombre: 'Nuevo nombre' });

    await setTenantStatus('tenant 1', false, 'Falta de pago');
    expect(client.patch).toHaveBeenNthCalledWith(2, '/identidad/platform/tenants/tenant%201/estado', { activo: false, motivo: 'Falta de pago' });
  });

  it('administra dominios usando ids codificados', async () => {
    vi.mocked(client.post).mockResolvedValue({ id: 'domain-1', domain: 'demo.restoapp.pe', activo: true, principal: false });
    await addTenantDomain('tenant/1', 'demo.restoapp.pe');
    expect(client.post).toHaveBeenCalledWith('/identidad/platform/tenants/tenant%2F1/domains', { domain: 'demo.restoapp.pe' });

    vi.mocked(client.delete).mockResolvedValue(undefined);
    await removeTenantDomain('tenant/1', 'domain/1');
    expect(client.delete).toHaveBeenCalledWith('/identidad/platform/tenants/tenant%2F1/domains/domain%2F1');
  });
});
