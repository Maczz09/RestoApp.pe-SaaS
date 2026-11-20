import type { PedidoVM } from '../types/pedido.types';

export function imprimirComandaCocina(pedido: PedidoVM): boolean {
  const win = globalThis.open('', '_blank');
  if (!win) return false;
  win.opener = null;
  const doc = win.document;
  doc.title = `Comanda ${pedido.id.slice(0, 8)}`;
  const style = doc.createElement('style');
  style.textContent = '@page{size:80mm auto;margin:5mm}body{font:14px monospace;max-width:75mm;margin:0;color:#000}h1{font-size:19px;text-align:center}p{white-space:pre-wrap;overflow-wrap:anywhere}.linea{border-top:1px dashed #333;padding-top:8px}@media print{button{display:none}}';
  doc.head.append(style);
  const line = (tag: string, text: string, cls = '') => { const el = doc.createElement(tag); el.className = cls; el.textContent = text; doc.body.append(el); return el; };
  line('h1', 'COMANDA DE COCINA');
  line('p', `${pedido.canal === 'SALON' ? `Mesa ${pedido.mesaNumero}` : pedido.canal}\nPedido ${pedido.id.slice(0, 8)}\nAtiende: ${pedido.meseroNombre ?? 'Sin asignar'}\n${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}`);
  for (const item of pedido.items.filter((i) => (i.area === 'COCINA' || i.area === 'BAR') && i.estado !== 'CANCELADO' && i.estado !== 'RECHAZADO_SIN_STOCK')) {
    line('p', `${item.cantidad} × ${item.nombre}\n${item.area === 'BAR' ? 'BARRA' : 'COCINA'}${item.notas ? `\nNOTA: ${item.notas}` : ''}`, 'linea');
  }
  const button = line('button', 'Imprimir'); button.addEventListener('click', () => win.print());
  win.focus(); win.print();
  return true;
}
