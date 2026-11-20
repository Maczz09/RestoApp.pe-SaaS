/** Read-only cashier notification. Requesting a bill never registers a payment. */
export interface SolicitudCuentaDto {
  id: string;
  cuentaId: string;
  mesaId: string;
  numeroMesa?: number;
  numerosMesa?: number[];
  cuentaCorrelativo?: string;
  total: number;
  solicitadaAt: string;
  solicitadoPorNombre: string;
}

export interface SolicitarCuentaResponse {
  id: string;
  cuentaId: string;
  solicitadaAt: string;
}
