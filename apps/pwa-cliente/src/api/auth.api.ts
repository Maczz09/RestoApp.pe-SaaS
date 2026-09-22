// api/auth.api.ts — Llamadas de autenticación y SaaS multi-tenant

import { client, setAuthToken, setTenantId } from './client';
import type {
  LoginRequest,
  LoginResponseDto,
  SelectTenantRequest,
  UserDto,
} from '../types/auth.types';

export interface OnboardingRequest {
  nombreRestaurante: string;
  slugRestaurante: string;
  rucRestaurante?: string;
  nombreSede: string;
  direccionSede?: string;
  nombreUsuario: string;
  emailUsuario: string;
  passwordUsuario: string;
}

/** POST /identidad/auth/login — Login con email + password */
export async function login(req: LoginRequest): Promise<UserDto> {
  const response = await client.post<LoginResponseDto | UserDto>(
    '/identidad/auth/login',
    req,
  );
  if ('usuario' in response) {
    setAuthToken(response.access_token);
    if (response.activeTenantId) {
      setTenantId(response.activeTenantId);
    }
    return {
      ...response.usuario,
      tenants: response.tenants ?? response.usuario.tenants,
      activeTenantId: response.activeTenantId ?? response.usuario.activeTenantId,
    };
  }
  return response;
}

/** POST /identidad/auth/tenant-select — Cambiar restaurante/tenant activo */
export async function selectTenant(req: SelectTenantRequest): Promise<LoginResponseDto> {
  const response = await client.post<LoginResponseDto>(
    '/identidad/auth/tenant-select',
    req,
  );
  if (response.access_token) {
    setAuthToken(response.access_token);
  }
  if (response.activeTenantId) {
    setTenantId(response.activeTenantId);
  }
  return response;
}

/** POST /identidad/auth/onboarding — Registrar nuevo restaurante */
export async function onboarding(req: OnboardingRequest): Promise<LoginResponseDto> {
  const response = await client.post<LoginResponseDto>(
    '/identidad/auth/onboarding',
    req,
  );
  if (response.access_token) {
    setAuthToken(response.access_token);
  }
  if (response.activeTenantId) {
    setTenantId(response.activeTenantId);
  }
  return response;
}

/** GET /identidad/auth/me — Restaurar sesión activa */
export function me(): Promise<UserDto> {
  return client.get<UserDto>('/identidad/auth/me');
}

/** Logout — limpieza local y en el backend */
export function logout(): Promise<{ success: boolean; message: string }> {
  return client.post<{ success: boolean; message: string }>(
    '/identidad/auth/logout',
  );
}

