import { useState } from 'react';
import { solicitarCuenta } from '../../api/solicitudes-cuenta.api';
import { imprimirPreCuenta } from '../../utils/preCuentaPrint';
import type { CuentaVM } from '../../types/cuenta.types';

interface Props { cuenta: CuentaVM; mesaNumero: string; online: boolean }

export function AccionesCuentaMesa({ cuenta, mesaNumero, online }: Readonly<Props>) {
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activa = cuenta.estado === 'ABIERTA';
  const solicitar = async () => {
    if (!activa || !online || sending || sent) return;
    setSending(true); setError(null);
    try { await solicitarCuenta(cuenta.id); setSent(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo solicitar la cuenta'); }
    finally { setSending(false); }
  };

  return (
    <section aria-label="Pre-cuenta y solicitud de cobro" style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button className="btn btn-soft" disabled={!activa} onClick={() => { setError(null); setPreview(true); }}>Pre-Cuenta</button>
        <button className="btn btn-primary" disabled={!activa || !online || sending || sent} onClick={() => void solicitar()}>
          {sending ? 'Enviando…' : sent ? 'Cuenta solicitada' : 'Solicitar Cuenta'}
        </button>
      </div>
      {sent && <p role="status" className="hint">Solicitud enviada a Caja. La mesa sigue abierta hasta que se registre el pago.</p>}
      {error && <p role="alert" className="banner err">{error}</p>}
      {preview && (
        <section aria-label={`Pre-Cuenta de Mesa ${mesaNumero}`} className="panel" style={{ padding: 16, marginTop: 12 }}>
          <h3>Pre-Cuenta · Mesa {mesaNumero}</h3>
          <p><b>PRE-CUENTA / NO VÁLIDO COMO COMPROBANTE DE PAGO</b></p>
          <p className="hint">Documento informativo. No es comprobante de pago.</p>
          {cuenta.pedidos.filter(p => p.estado !== 'CANCELADO' && p.estado !== 'RECHAZADO_SIN_STOCK').flatMap((p) => p.items).filter((i) => i.estado !== 'CANCELADO' && i.estado !== 'RECHAZADO_SIN_STOCK').map((item) => (
            <div className="kv" key={item.id}>
              <span>{item.cantidad} × {item.nombre}{item.notas && <small style={{ display: 'block' }}>{item.notas}</small>}</span>
              <span>S/ {item.subtotal.toFixed(2)}</span>
            </div>
          ))}
          <p><b>Total: S/ {cuenta.total.toFixed(2)}</b></p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => {
              if (!imprimirPreCuenta({ cuenta, mesaNumero })) setError('Permite abrir una ventana para imprimir la pre-cuenta');
            }}>Imprimir Pre-Cuenta</button>
            <button className="btn btn-ghost" onClick={() => setPreview(false)}>Cerrar Pre-Cuenta</button>
          </div>
        </section>
      )}
    </section>
  );
}
