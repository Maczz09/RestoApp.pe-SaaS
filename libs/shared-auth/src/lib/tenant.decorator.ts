import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Decorador para inyectar el `tenantId` verificado del usuario autenticado.
 */
export const TenantActual = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user?.tenantId ?? null;
});

/**
 * Decorador para inyectar el objeto completo de usuario autenticado con claims SaaS.
 */
export const UsuarioActual = createParamDecorator((data: string | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  const user = request.user;
  return data && user ? user[data] : user;
});
