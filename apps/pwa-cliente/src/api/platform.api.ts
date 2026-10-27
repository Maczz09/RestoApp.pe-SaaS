import { client } from './client';
import type {
  CreatePlatformTenantRequest,
  PlatformOverview,
  PlatformTenant,
  PlatformTenantDomain,
  PlatformTenantListResponse,
  UpdatePlatformTenantRequest,
  PlatformPlan,
  PlatformBillingRow,
  PlatformPayment,
  PlatformAdminAccount,
} from '../types/platform.types';

export function listPlans(): Promise<PlatformPlan[]> { return client.get('/identidad/platform/plans'); }
export function createPlan(input: Partial<PlatformPlan>): Promise<PlatformPlan> { return client.post('/identidad/platform/plans', input); }
export function updatePlan(code: string, input: Partial<PlatformPlan>): Promise<PlatformPlan> { return client.patch(`/identidad/platform/plans/${encodeURIComponent(code)}`, input); }
export function listBilling(): Promise<{ data: PlatformBillingRow[]; summary: { vencidos: number; proximos: number; alDia: number; sinFecha: number; sinPagos: number; conPagos: number } }> { return client.get('/identidad/platform/billing'); }
export function listPayments(tenantId: string): Promise<PlatformPayment[]> { return client.get(`/identidad/platform/tenants/${encodeURIComponent(tenantId)}/payments`); }
export function recordPayment(tenantId: string, input: { amountCents: number; periods: number; method: string; reference?: string; note?: string; paidAt?: string }): Promise<PlatformPayment> { return client.post(`/identidad/platform/tenants/${encodeURIComponent(tenantId)}/payments`, input); }
export function setDueDate(tenantId: string, nextDueAt: string): Promise<{ nextDueAt: string }> { return client.patch(`/identidad/platform/tenants/${encodeURIComponent(tenantId)}/due-date`, { nextDueAt }); }
export function listPlatformAdmins(): Promise<PlatformAdminAccount[]> { return client.get('/identidad/platform/admins'); }
export function createPlatformAdmin(input: { nombre: string; email: string; password: string }): Promise<PlatformAdminAccount> { return client.post('/identidad/platform/admins', input); }
export function setPlatformAdminStatus(id: string, activo: boolean): Promise<PlatformAdminAccount> { return client.patch(`/identidad/platform/admins/${encodeURIComponent(id)}/estado`, { activo }); }
export function resetPlatformAdminPassword(id: string, password: string): Promise<{ success: boolean }> { return client.patch(`/identidad/platform/admins/${encodeURIComponent(id)}/password`, { password }); }
export function startTenantObservation(id: string): Promise<{ started: boolean }> { return client.post(`/identidad/platform/tenants/${encodeURIComponent(id)}/observe/start`); }
export function getTenantObservation(id: string): Promise<{ tenant: PlatformTenant; sedes: Array<{ id: string; nombre: string; activa: boolean }>; usuarios: Array<{ rol: string; usuario: { id: string; nombre: string; email: string; activo: boolean } }>; audit: Array<{ id: string; accion: string; servicio: string; resultado: string; createdAt: string }>; observedAt: string }> { return client.get(`/identidad/platform/tenants/${encodeURIComponent(id)}/observe`); }
async function readLive<T>(path: string, numbers: string[], arrays: string[], records: string[] = []): Promise<T> {
  const payload: unknown = await client.get(path, { cache: 'no-store' });
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Respuesta de observación inválida');
  const data = payload as Record<string, unknown>;
  if (numbers.some((key) => typeof data[key] !== 'number') || arrays.some((key) => !Array.isArray(data[key])) || records.some((key) => !data[key] || typeof data[key] !== 'object' || Array.isArray(data[key]))) {
    throw new Error('Respuesta de observación incompatible con el servicio');
  }
  return payload as T;
}

export function getTenantLiveSales(id: string): Promise<{ totalVentas: number; ingresosTotales: number; ventasPorHora: Array<{ hora: string; total: number }>; topPlatos: Array<{ nombre: string; cantidad: number }>; topProductos: Array<{ nombre: string; cantidad: number }> }> { return readLive(`/reportes/platform/tenants/${encodeURIComponent(id)}/live`, ['totalVentas', 'ingresosTotales'], ['ventasPorHora', 'topPlatos', 'topProductos']); }
export function getTenantLiveTables(id: string): Promise<{ total: number; porEstado: Record<string, number>; recientes: Array<{ id: string; numero: number; estado: string; updatedAt: string }> }> { return readLive(`/mesas/platform/tenants/${encodeURIComponent(id)}/live`, ['total'], ['recientes'], ['porEstado']); }
export function getTenantLiveOrders(id: string): Promise<{ total: number; porEstado: Record<string, number>; recientes: Array<{ id: string; estado: string; modalidad: string | null; updatedAt: string }> }> { return readLive(`/pedidos/platform/tenants/${encodeURIComponent(id)}/live`, ['total'], ['recientes'], ['porEstado']); }
export function getTenantLiveCash(id: string): Promise<{ turnosAbiertos: number; pagosUltimas24h: number; ingresosUltimas24h: number; recientes: Array<{ id: string; sedeId: string; cajaNombre: string; estado: string; abiertoAt: string; cerradoAt: string | null }> }> { return readLive(`/caja/platform/tenants/${encodeURIComponent(id)}/live`, ['turnosAbiertos', 'pagosUltimas24h', 'ingresosUltimas24h'], ['recientes']); }
export function getTenantLiveReservations(id: string): Promise<{ total: number; porEstado: Record<string, number>; proximas: Array<{ id: string; sedeId: string; fecha: string; hora: string; estado: string; numComensales: number }> }> { return readLive(`/reservas/platform/tenants/${encodeURIComponent(id)}/live`, ['total'], ['proximas'], ['porEstado']); }
export function getTenantLiveInventory(id: string): Promise<{ productos: number; agotados: number; noDisponibles: number; mermasRecientes: Array<{ id: string; cantidad: number; motivo: string; origen: string; createdAt: string; producto: { nombre: string } }> }> { return readLive(`/inventario/platform/tenants/${encodeURIComponent(id)}/live`, ['productos', 'agotados', 'noDisponibles'], ['mermasRecientes']); }

function withTenantDefaults(tenant: PlatformTenant): PlatformTenant {
  return {
    ...tenant,
    domains: tenant.domains ?? [],
    sedesCount: tenant.sedesCount ?? tenant.sedes?.length ?? 0,
  };
}

export function getPlatformSummary(): Promise<PlatformOverview> {
  return client.get<PlatformOverview>('/identidad/platform/summary');
}

export async function listTenants(params?: {
  search?: string;
  estado?: 'todos' | 'activos' | 'suspendidos';
  plan?: string;
  limit?: number;
  cursor?: string;
}): Promise<PlatformTenantListResponse> {
  const query = new URLSearchParams();
  if (params?.search?.trim()) query.set('search', params.search.trim());
  if (params?.estado && params.estado !== 'todos') {
    query.set('estado', params.estado === 'activos' ? 'ACTIVO' : 'SUSPENDIDO');
  }
  if (params?.plan?.trim()) query.set('plan', params.plan.trim());
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.cursor) query.set('cursor', params.cursor);
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  const response = await client.get<PlatformTenantListResponse>(
    `/identidad/platform/tenants${suffix}`,
  );
  return {
    data: (response.data ?? []).map(withTenantDefaults),
    nextCursor: response.nextCursor ?? null,
  };
}

export async function getTenant(tenantId: string): Promise<PlatformTenant> {
  const response = await client.get<PlatformTenant | { tenant: PlatformTenant }>(
    `/identidad/platform/tenants/${encodeURIComponent(tenantId)}`,
  );
  const tenant = 'tenant' in response ? response.tenant : response;
  return withTenantDefaults(tenant);
}

export async function createTenant(payload: CreatePlatformTenantRequest): Promise<PlatformTenant> {
  const response = await client.post<PlatformTenant | { tenant: PlatformTenant }>(
    '/identidad/platform/tenants',
    payload,
  );
  return withTenantDefaults('tenant' in response ? response.tenant : response);
}

export async function updateTenant(
  tenantId: string,
  payload: UpdatePlatformTenantRequest,
): Promise<PlatformTenant> {
  const response = await client.patch<PlatformTenant | { tenant: PlatformTenant }>(
    `/identidad/platform/tenants/${encodeURIComponent(tenantId)}`,
    payload,
  );
  return withTenantDefaults('tenant' in response ? response.tenant : response);
}

export async function setTenantStatus(tenantId: string, activo: boolean, motivo?: string): Promise<PlatformTenant> {
  const response = await client.patch<PlatformTenant | { tenant: PlatformTenant }>(
    `/identidad/platform/tenants/${encodeURIComponent(tenantId)}/estado`,
    { activo, ...(motivo?.trim() ? { motivo: motivo.trim() } : {}) },
  );
  return withTenantDefaults('tenant' in response ? response.tenant : response);
}

export async function updateTenantDomain(
  tenantId: string,
  domainId: string,
  payload: { domain?: string; activo?: boolean; principal?: boolean },
): Promise<PlatformTenantDomain> {
  const response = await client.patch<PlatformTenantDomain | { domain: PlatformTenantDomain }>(
    `/identidad/platform/tenants/${encodeURIComponent(tenantId)}/domains/${encodeURIComponent(domainId)}`,
    payload,
  );
  return 'id' in response ? response : response.domain;
}

export async function addTenantDomain(
  tenantId: string,
  domain: string,
): Promise<PlatformTenantDomain> {
  const response = await client.post<PlatformTenantDomain | { domain: PlatformTenantDomain }>(
    `/identidad/platform/tenants/${encodeURIComponent(tenantId)}/domains`,
    { domain },
  );
  return 'id' in response ? response : response.domain;
}

export function removeTenantDomain(tenantId: string, domainId: string): Promise<void> {
  return client.delete<void>(
    `/identidad/platform/tenants/${encodeURIComponent(tenantId)}/domains/${encodeURIComponent(domainId)}`,
  );
}
