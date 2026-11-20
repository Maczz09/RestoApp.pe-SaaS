import { useEffect, useState } from 'react';
import { listarEmpresas } from '../../api/facturacion.api';
import type { TipoComprobante } from '../../types/cuenta.types';
import type { EmpresaDto } from '../../types/facturacion.types';

export interface DocumentoSelección {
  tipoComprobante: TipoComprobante | '';
  empresaRuc: string;
  clienteDocumento: string;
  clienteNombre: string;
  clienteRazonSocial: string;
}

export const DOCUMENTO_VACIO: DocumentoSelección = {
  tipoComprobante: '', empresaRuc: '', clienteDocumento: '', clienteNombre: '', clienteRazonSocial: '',
};

export function documentoCompleto(value: DocumentoSelección, total: number): boolean {
  const { tipoComprobante, empresaRuc, clienteDocumento, clienteNombre, clienteRazonSocial } = value;
  if (!tipoComprobante) return false;
  if (tipoComprobante === 'TICKET') return true;
  if (!empresaRuc) return false;
  if (tipoComprobante === 'FACTURA') return /^\d{11}$/.test(clienteDocumento) && Boolean(clienteRazonSocial.trim());
  if (total > 700 || clienteDocumento || clienteNombre) return /^\d{8}$/.test(clienteDocumento) && Boolean(clienteNombre.trim());
  return true;
}

export function DocumentoCobroSelector({ value, onChange, sedeId, total }: Readonly<{
  value: DocumentoSelección;
  onChange: (value: DocumentoSelección) => void;
  sedeId?: string;
  total: number;
}>) {
  const [empresas, setEmpresas] = useState<EmpresaDto[]>([]);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const fiscal = value.tipoComprobante === 'BOLETA' || value.tipoComprobante === 'FACTURA';
  const factura = value.tipoComprobante === 'FACTURA';
  useEffect(() => {
    if (!fiscal) return;
    let active = true;
    void listarEmpresas().then(result => {
      if (!active) return;
      setEmpresas(result.filter(e => e.activo && e.sedeId === sedeId));
      setEstado('listo');
    }).catch(() => { if (active) setEstado('error'); });
    return () => { active = false; };
  }, [fiscal, sedeId]);

  return (
    <fieldset className="documento-cobro">
      <legend>Documento del cobro</legend>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {([{ tipo: 'TICKET', label: 'Ticket interno' }, { tipo: 'BOLETA', label: 'Boleta electrónica' },
          { tipo: 'FACTURA', label: 'Factura electrónica' }] as const).map(({ tipo, label }) => (
          <button key={tipo} type="button" aria-pressed={value.tipoComprobante === tipo}
            className={`chip ${value.tipoComprobante === tipo ? 'on' : ''}`}
            onClick={() => onChange({ ...DOCUMENTO_VACIO, empresaRuc: value.empresaRuc, tipoComprobante: tipo })}>{label}</button>
        ))}
      </div>
      {value.tipoComprobante === 'TICKET' && <div className="hint">Registro interno de Caja. Sin validez como comprobante tributario.</div>}
      {fiscal && <>
        <label className="field">Emisor de la sede
          <select value={value.empresaRuc} onChange={e => onChange({ ...value, empresaRuc: e.target.value })}>
            <option value="">Seleccionar emisor</option>
            {empresas.map(empresa => <option key={empresa.id} value={empresa.ruc}>{empresa.razonSocial} · {empresa.ruc}</option>)}
          </select>
        </label>
        {estado === 'cargando' && <div className="hint">Cargando emisores…</div>}
        {estado === 'error' && <div role="alert">No se pudo consultar los emisores de esta sede.</div>}
        {estado === 'listo' && empresas.length === 0 && <div role="alert">Configura un emisor activo en Facturación para esta sede.</div>}
        <label className="field">{factura ? 'RUC del cliente' : 'DNI del cliente'}
          <input value={value.clienteDocumento} inputMode="numeric" maxLength={factura ? 11 : 8}
            required={factura || total > 700} onChange={e => onChange({ ...value, clienteDocumento: e.target.value.replace(/\D/g, '') })} />
        </label>
        <label className="field">{factura ? 'Razón social' : 'Nombre del cliente'}
          <input value={factura ? value.clienteRazonSocial : value.clienteNombre} maxLength={180} required={factura || total > 700}
            onChange={e => onChange({ ...value, [factura ? 'clienteRazonSocial' : 'clienteNombre']: e.target.value })} />
        </label>
      </>}
    </fieldset>
  );
}
