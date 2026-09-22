/**
 * T-19: matriz evento→roles para los rooms de WebSocket. Fuente única alineada con
 * los `@Roles` HTTP. El gateway de notificaciones une cada cliente al room `rol:<ROL>`
 * y emite cada evento solo a los roles que lo necesitan, en vez de un broadcast global.
 *
 * La clave es el prefijo de dominio de la routing key (`pago` en `pago.registrado`).
 */
export const WS_EVENT_ROLES: Record<string, readonly string[]> = {
  // Caja / pagos / cierres
  pago: ['ADMIN', 'CAJERO', 'GERENCIA'],
  arqueo: ['ADMIN', 'CAJERO', 'GERENCIA'],
  ticket: ['ADMIN', 'CAJERO', 'GERENCIA'],
  // Operación de sala
  pedido: ['ADMIN', 'SISTEMA', 'CAJERO', 'MESERO', 'COCINA'],
  mesa: ['ADMIN', 'SISTEMA', 'CAJERO', 'MESERO', 'COCINA'],
  cuenta: ['ADMIN', 'SISTEMA', 'CAJERO', 'MESERO', 'COCINA'],
  // Inventario
  stock: ['ADMIN', 'GERENCIA', 'COCINA'],
  producto: ['ADMIN', 'GERENCIA', 'COCINA'],
  // Reservas
  reserva: ['ADMIN', 'RECEPCION', 'GERENCIA', 'MESERO'],
} as const;

/** Prefijo de room por rol. */
export const wsRoomForRole = (rol: string): string => `rol:${rol}`;

/**
 * Devuelve los rooms (`rol:<ROL>`) que deben recibir un evento según su routing key
 * (`pago.registrado` → roles de `pago`). Si el dominio no está en la matriz, devuelve
 * `[]` (nadie lo recibe) para fallar cerrado en vez de filtrar de más.
 */
export function wsRoomsForPattern(pattern: string): string[] {
  const dominio = pattern.split('.')[0];
  const roles = WS_EVENT_ROLES[dominio] ?? [];
  return roles.map(wsRoomForRole);
}

/** Prefijo de room por tenant y rol (aislamiento estricto SaaS). */
export const wsRoomForTenantRole = (tenantId: string, rol: string, sedeId?: string | null): string =>
  sedeId ? `tenant:${tenantId}:sede:${sedeId}:rol:${rol}` : `tenant:${tenantId}:rol:${rol}`;

/** Room para todo un tenant o tenant/sede */
export const wsRoomForTenant = (tenantId: string): string => `tenant:${tenantId}`;
export const wsRoomForTenantSede = (tenantId: string, sedeId: string): string => `tenant:${tenantId}:sede:${sedeId}`;

/**
 * Devuelve los rooms tenant-aware que deben recibir un evento según su routing key, tenantId y sedeId.
 */
export function wsTenantRoomsForPattern(pattern: string, tenantId: string, sedeId?: string | null): string[] {
  if (!tenantId) return wsRoomsForPattern(pattern);
  const dominio = pattern.split('.')[0];
  const roles = WS_EVENT_ROLES[dominio] ?? [];
  const rooms: string[] = roles.map((rol) => wsRoomForTenantRole(tenantId, rol, sedeId));
  if (sedeId) {
    roles.forEach((rol) => {
      rooms.push(wsRoomForTenantRole(tenantId, rol));
    });
  }
  return rooms;
}
