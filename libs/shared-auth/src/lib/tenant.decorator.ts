import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { resolveTenantHost } from './tenant-host';
import type { TenantHostResolution } from './tenant-host';

interface AuthenticatedUser {
  tenantId?: string | null;
  [claim: string]: unknown;
}

interface AuthenticatedRequest {
  user?: AuthenticatedUser;
  headers?: { host?: string };
  tenantHost?: TenantHostResolution;
}

/**
 * Decorador para inyectar el `tenantId` verificado del usuario autenticado.
 */
export const TenantActual = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user?.tenantId ?? null;
  },
);

/**
 * Decorador para inyectar el objeto completo de usuario autenticado con claims SaaS.
 */
export const UsuarioActual = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    return data && user ? user[data] : user;
  },
);

/**
 * Inyecta la resolución derivada del Host original, incluida en rutas públicas.
 * No lee X-Tenant-Id ni otro header seleccionable por el navegador.
 */
export const TenantHostActual = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantHostResolution => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.tenantHost ?? resolveTenantHost(request.headers?.host);
  },
);
