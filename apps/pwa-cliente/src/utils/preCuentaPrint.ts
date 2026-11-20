import type { CuentaVM } from '../types/cuenta.types';

export interface PreCuentaPrint {
  cuenta: CuentaVM;
  mesaNumero: string;
}

/** Browser-only printout. Never closes an account, registers a payment, or emits SUNAT documents. */
export function imprimirPreCuenta({ cuenta, mesaNumero }: PreCuentaPrint): boolean {
  const printWindow = globalThis.open('', '_blank');
  if (!printWindow) return false;
  printWindow.opener = null;
  const doc = printWindow.document;
  doc.title = `Pre-Cuenta · Mesa ${mesaNumero}`;
  const style = doc.createElement('style');
  style.textContent = '@page{size:80mm auto;margin:5mm}body{font:12px monospace;margin:0;max-width:75mm;color:#000}h1{text-align:center;font-size:17px}table{width:100%;border-collapse:collapse}td{padding:5px 0;border-bottom:1px dashed #aaa;vertical-align:top}td:last-child{text-align:right;white-space:nowrap}p{white-space:pre-wrap}.total{text-align:right;font-weight:bold;font-size:16px}@media print{button{display:none}}';
  doc.head.append(style);
  const append = (tag: string, text: string) => { const el = doc.createElement(tag); el.textContent = text; doc.body.append(el); return el; };
  append('h1', 'PRE-CUENTA');
  append('p', 'PRE-CUENTA / NO VÁLIDO COMO COMPROBANTE DE PAGO');
  append('p', `Mesa ${mesaNumero}\nAtención ${cuenta.id.slice(0, 8)}\n${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}`);
  const table = doc.createElement('table');
  for (const item of cuenta.pedidos.filter(p => p.estado !== 'CANCELADO' && p.estado !== 'RECHAZADO_SIN_STOCK').flatMap((p) => p.items).filter((i) => i.estado !== 'CANCELADO' && i.estado !== 'RECHAZADO_SIN_STOCK')) {
    const row = doc.createElement('tr');
    const name = doc.createElement('td'); name.textContent = `${item.cantidad} × ${item.nombre}${item.notas ? `\n${item.notas}` : ''}`;
    const amount = doc.createElement('td'); amount.textContent = `S/ ${item.subtotal.toFixed(2)}`;
    row.append(name, amount); table.append(row);
  }
  doc.body.append(table);
  append('p', `TOTAL: S/ ${cuenta.total.toFixed(2)}`).className = 'total';
  append('p', 'Documento informativo. No es comprobante de pago.');
  const button = append('button', 'Imprimir'); button.addEventListener('click', () => printWindow.print());
  printWindow.focus();
  printWindow.print();
  return true;
}
