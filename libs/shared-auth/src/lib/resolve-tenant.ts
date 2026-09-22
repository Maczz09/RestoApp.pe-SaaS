import { ForbiddenException } from '@nestjs/common';

export const TENANT_DEMO_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Resuelve el tenantId efectivo de una solicitud a partir del JWT autenticado.
 * Aislamiento estricto: NUNCA se confía en un tenantId enviado por query param
 * o body si no coincide con el token de sesión verificado, salvo tokens S2S
 * (rol SISTEMA) o administradores de plataforma.
 */
export function resolveTenantId(
  userTenantId?: string | null,
  solicitadoTenantId?: string | null,
  userRol?: string | null,
): string {
  // Tokens de servicio interno (S2S SISTEMA) o rol PLATFORM_ADMIN pueden operar sobre tenant solicitado
  if (userRol === 'SISTEMA' || userRol === 'PLATFORM_ADMIN') {
    const effective = solicitadoTenantId || userTenantId || TENANT_DEMO_ID;
    return effective;
  }

  if (userTenantId) {
    if (solicitadoTenantId && solicitadoTenantId !== userTenantId) {
      throw new ForbiddenException('No tienes permiso para acceder a datos de otro restaurante.');
    }
    return userTenantId;
  }

  if (solicitadoTenantId) {
    throw new ForbiddenException('Sesión sin restaurante activo. Inicia sesión seleccionando tu restaurante.');
  }

  return TENANT_DEMO_ID;
}
