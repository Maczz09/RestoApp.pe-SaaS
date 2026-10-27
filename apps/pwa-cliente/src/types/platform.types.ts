export type EstadoTenant = 'ACTIVO' | 'SUSPENDIDO';

export interface PlatformTenantDomain {
  id: string;
  domain: string;
  activo: boolean;
  principal: boolean;
  createdAt?: string;
}

export interface PlatformTenantOwner {
  id: string;
  nombre: string;
  email: string;
  activo?: boolean;
  telefono?: string | null;
}

export interface PlatformTenantSede {
  id: string;
  nombre: string;
  direccion?: string | null;
  ruc?: string | null;
  telefono?: string | null;
  activa: boolean;
}

export interface PlatformTenant {
  id: string;
  nombre: string;
  slug: string;
  ruc?: string | null;
  plan: string;
  activo: boolean;
  createdAt: string;
  updatedAt?: string;
  domains: PlatformTenantDomain[];
  sedes?: PlatformTenantSede[];
  sedesCount: number;
  admin?: PlatformTenantOwner | null;
  usuariosCount?: number;
}

export interface PlatformOverview {
  totalTenants: number;
  tenantsActivos: number;
  tenantsSuspendidos: number;
  tenantsEnOnboarding: number;
  tenantsConIncidencias: number;
  totalSedes: number;
  totalUsuarios: number;
  totalDomains: number;
}

export interface PlatformTenantListResponse {
  data: PlatformTenant[];
  nextCursor: string | null;
}

export interface CreatePlatformTenantRequest {
  nombre: string;
  slug: string;
  ruc?: string;
  plan: string;
  domain?: string;
  administrador: {
    nombre: string;
    email: string;
    password: string;
    telefono?: string;
  };
  sede?: {
    nombre: string;
    direccion?: string;
    ruc?: string;
    telefono?: string;
  };
}

export interface UpdatePlatformTenantRequest {
  nombre?: string;
  slug?: string;
  ruc?: string | null;
  plan?: string;
}

export interface PlatformPlan {
  code: string;
  nombre: string;
  descripcion: string | null;
  priceCents: number;
  cycleDays: number;
  activo: boolean;
}

export interface PlatformBillingRow {
  id: string;
  nombre: string;
  slug: string;
  activo: boolean;
  plan: string;
  planNombre: string;
  priceCents: number | null;
  nextDueAt: string | null;
  estadoPago: 'SIN_FECHA' | 'VENCIDO' | 'PROXIMO' | 'AL_DIA';
  lastPaymentAt: string | null;
  lastPaymentCents: number | null;
  everPaid: boolean;
}

export interface PlatformPayment {
  id: string;
  amountCents: number;
  periods: number;
  method: string;
  reference: string | null;
  paidAt: string;
  dueAfter: string;
}

export interface PlatformAdminAccount { id: string; nombre: string; email: string; activo: boolean; createdAt: string; }
