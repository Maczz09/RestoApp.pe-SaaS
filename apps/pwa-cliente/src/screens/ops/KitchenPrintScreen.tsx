import { useState } from 'react';
import { usePedidosQuery } from '../../hooks/queries/usePedidosQuery';
import { imprimirComandaCocina } from '../../utils/kitchenPrint';
import { ESTADOS_PRODUCCION } from '../../domain/pedido.flow';

/** Browser printing for SaaS, independent of Tauri or a local server/printer API. */
export function KitchenPrintScreen() {
  const { pedidos, loading, error, fetch } = usePedidosQuery(undefined, { autoLoadAll: true });
  const [message, setMessage] = useState('');
  const tickets = pedidos.filter((p) => ESTADOS_PRODUCCION.has(p.estado) && p.items.some((i) =>
    (i.area === 'COCINA' || i.area === 'BAR') && i.estado !== 'CANCELADO' && i.estado !== 'RECHAZADO_SIN_STOCK'));
  return (
    <div>
      <div className="page-h"><div><h1>Impresión de cocina</h1><div className="sub">Comandas activas · impresión desde este navegador</div></div><span className="spacer" /><button className="btn btn-ghost" onClick={() => void fetch()}>Actualizar comandas</button></div>
      <p className="hint">Abre una comanda y elige la impresora en el diálogo del navegador. Esta vista no confirma una impresión física ni cambia el estado de los platos.</p>
      {message && <p role="status" className="banner info">{message}</p>}
      {error && <p role="alert" className="banner err">{error}</p>}
      {loading && <p>Cargando comandas…</p>}
      {!loading && !tickets.length && <div className="empty"><h3>Sin comandas activas para imprimir</h3></div>}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))' }}>
        {tickets.map((pedido) => (
          <section key={pedido.id} className="panel" style={{ padding: 16 }}>
            <h3>{pedido.canal === 'SALON' ? `Mesa ${pedido.mesaNumero}` : pedido.canal} · {pedido.id.slice(0, 8)}</h3>
            {pedido.items.filter((i) => (i.area === 'COCINA' || i.area === 'BAR') && i.estado !== 'CANCELADO' && i.estado !== 'RECHAZADO_SIN_STOCK').map((item) => (
              <p key={item.id}>{item.cantidad} × {item.nombre}{item.notas && <small style={{ display: 'block' }}>{item.notas}</small>}</p>
            ))}
            <button className="btn btn-primary" aria-label={`Imprimir comanda ${pedido.id.slice(0, 8)}`} onClick={() => {
              setMessage(imprimirComandaCocina(pedido) ? 'Comanda abierta para imprimir en el navegador.' : 'Permite abrir ventanas para imprimir la comanda.');
            }}>Imprimir comanda</button>
          </section>
        ))}
      </div>
    </div>
  );
}
