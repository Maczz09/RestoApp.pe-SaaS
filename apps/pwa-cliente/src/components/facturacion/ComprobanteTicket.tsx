import { BrandLogo } from '../brand/BrandLogo';
import { fmt } from '../../utils/format';
import type { ComprobanteDto, ItemComprobantePago } from '../../types/facturacion.types';

const Row = ({ l, v, bold }: Readonly<{ l: string; v: string; bold?: boolean }>) => (
  <div className={`zrow ${bold ? 'bold' : ''}`}><span>{l}</span><span>{v}</span></div>
);

export interface ComprobanteTicketProps {
  comprobante: ComprobanteDto;
  items: ItemComprobantePago[];
}

function datosCliente(comprobante: ComprobanteDto) {
  if (comprobante.tipo === 'FACTURA') {
    return [
      { label: 'RUC cliente', valor: comprobante.clienteRuc ?? '—' },
      { label: 'Razón social', valor: comprobante.clienteRazonSocial ?? '—' },
    ];
  }
  if (comprobante.clienteDni) {
    return [
      { label: 'DNI cliente', valor: comprobante.clienteDni },
      { label: 'Cliente', valor: comprobante.clienteNombre ?? '—' },
    ];
  }
  return [{ label: 'Cliente', valor: 'Cliente varios' }];
}

export function ComprobanteTicket({ comprobante, items }: Readonly<ComprobanteTicketProps>) {
  const fecha = new Date(comprobante.createdAt);
  const empresa = comprobante.empresa;
  const nombreEmisor = empresa.nombreComercial ?? empresa.razonSocial;

  return (
    <div className="print-area">
      <div className="zticket">
        <div className="zc">
          <BrandLogo variant="full" theme="light" height={38} style={{ marginBottom: 6 }} />
          <h4>{nombreEmisor.toUpperCase()}</h4>
          {empresa.nombreComercial && <div style={{ fontSize: 11 }}>{empresa.razonSocial}</div>}
          <div style={{ fontSize: 11 }}>RUC {empresa.ruc}</div>
          {empresa.direccion && <div style={{ fontSize: 11 }}>{empresa.direccion}</div>}
        </div>
        <hr className="zhr" />
        <div className="zc">
          <div className="zlbl">{comprobante.tipo === 'FACTURA' ? 'Factura electrónica' : 'Boleta de venta electrónica'}</div>
          <div style={{ fontWeight: 800, fontSize: 14 }}>{comprobante.serie}-{comprobante.correlativo}</div>
        </div>
        <Row l="Fecha emisión" v={fecha.toLocaleDateString('es-PE')} />
        <Row l="Hora" v={fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })} />
        {datosCliente(comprobante).map((dato) => <Row key={dato.label} l={dato.label} v={dato.valor} />)}
        <hr className="zhr" />
        <div className="zlbl" style={{ marginBottom: 4 }}>Ítems</div>
        {items.map((item, index) => <Row key={`${item.productoId}-${index}`} l={`${item.cantidad}x ${item.nombre}`} v={fmt(item.cantidad * item.precioUnitario)} />)}
        <hr className="zhr" />
        <Row l="Op. gravada" v={fmt(Number(comprobante.subtotal))} />
        <Row l="IGV (18%)" v={fmt(Number(comprobante.igv))} />
        <Row l="Total" v={fmt(Number(comprobante.total))} bold />
        <hr className="zhr" />
        <Row l="Forma de pago" v="Contado" />
        <div className="zc" style={{ marginTop: 10, fontSize: 10, color: '#686868' }}>Representación impresa del comprobante electrónico</div>
      </div>
    </div>
  );
}
