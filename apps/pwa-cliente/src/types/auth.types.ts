// types/auth.types.ts — DTOs de autenticación y SaaS multi-tenant

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TenantDto {
  id: string;
  nombre: string;
  slug: string;
  ruc?: string | null;
  activo: boolean;
  plan: string;
  createdAt: string;
}

export interface UserTenantSummaryDto {
  tenant: TenantDto;
  membershipId: string;
  rol: string;
  sedes: Array<{
    id: string;
    nombre: string;
    direccion?: string | null;
    ruc?: string | null;
    activa: boolean;
  }>;
}

export interface SelectTenantRequest {
  tenantId: string;
  sedeId?: string;
}

export interface UserDto {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  activo?: boolean;
  createdAt?: string;
  /** null = admin general (opera cualquier sede, debe elegir una). T-23. */
  sedeId?: string | null;
  activeTenantId?: string | null;
  tenants?: UserTenantSummaryDto[];
}

export interface LoginResponseDto {
  access_token: string;
  usuario: UserDto;
  tenants?: UserTenantSummaryDto[];
  activeTenantId?: string | null;
  activeSedeId?: string | null;
}

