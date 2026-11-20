import { client } from './client';
import type { SolicitudCuentaDto, SolicitarCuentaResponse } from '@org/contracts';
export type { SolicitudCuentaDto } from '@org/contracts';

export function solicitarCuenta(cuentaId: string): Promise<SolicitarCuentaResponse> {
  return client.post(`/cuentas/${encodeURIComponent(cuentaId)}/solicitar-cuenta`, {});
}

export function listarSolicitudesCuenta(): Promise<SolicitudCuentaDto[]> {
  return client.get('/cuentas/solicitudes-cuenta');
}
