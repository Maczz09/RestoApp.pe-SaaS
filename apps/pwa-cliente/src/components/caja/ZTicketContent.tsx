import { BrandLogo } from '../brand/BrandLogo';
import { fmt } from '../../utils/format';
import { APP_NAME } from '../../config';
import { METODO_META, METODOS_ORDEN } from '../../screens/caja/cajaMeta';
import type { MetodoPagoCaja } from '../../types/caja.types';
import type { SedeDto } from '../../types/sede.types';

const Row = ({ l, v, bold }: Readonly<{ l: string; v: string; bold?: boolean }>) => (
  <div className={`zrow ${bold ? 'bold' : ''}`}><span>{l}</span><span>{v}</span></div>
);

export type EstadoCuadre = 'ok' | 'faltante' | 'sobrante';

const CUADRE_ROW_LABEL: Record<EstadoCuadre, string> = { ok: 'Cuadre', faltante: 'Faltante', sobrante: 'Sobrante' };

export interface ZTicketKpis {
  porMetodo: Record<MetodoPagoCaja, number>;
  totalVentas: number;
  totalEgresos: number;
  propinas: number;
  comprobantes: number;
}

export interface ZTicketContentProps {
  k: ZTicketKpis;
  esperado: number;
  contado: number;
  descuadre: number;
  estado: EstadoCuadre;
  cajeroNombre: string;
  fecha: string;
  sede?: SedeDto | null;
}

export function ZTicketContent({ k, esperado, contado, descuadre, estado, cajeroNombre, fecha, sede }: Readonly<ZTicketContentProps>) {
  const fechaDate = new Date(fecha);
  return (
    <div className="print-area">
      <div className="zticket">
        <div className="zc">
          <BrandLogo variant="full" theme="light" height={38} style={{ marginBottom: 6 }} />
          <h4>{(sede?.nombre ?? APP_NAME).toUpperCase()}</h4>
          {sede?.direccion && <div style={{ fontSize: 11 }}>{sede.direccion}</div>}
          {sede?.ruc && <div style={{ fontSize: 11 }}>RUC {sede.ruc}</div>}
        </div>
        <hr className="zhr" />
        <div className="zc"><div className="zlbl">Reporte interno · Cierre de caja</div><div style={{ fontWeight: 800, fontSize: 14 }}>Terminal 01</div></div>
        <Row l="Fecha" v={fechaDate.toLocaleDateString('es-PE')} />
        <Row l="Cierre" v={fechaDate.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })} />
        <Row l="Cajero" v={cajeroNombre} />
        <hr className="zhr" />
        <div className="zlbl" style={{ marginBottom: 4 }}>Ventas por método</div>
        {METODOS_ORDEN.map((metodo) => <Row key={metodo} l={METODO_META[metodo].label} v={fmt(k.porMetodo[metodo])} />)}
        <hr className="zhr" />
        <Row l="Ventas totales" v={fmt(k.totalVentas)} bold />
        <Row l="Egresos" v={fmt(k.totalEgresos)} />
        <Row l="Propinas" v={fmt(k.propinas)} />
        <hr className="zhr" />
        <div className="zlbl" style={{ marginBottom: 4 }}>Arqueo de efectivo</div>
        <Row l="Esperado" v={fmt(esperado)} />
        <Row l="Contado" v={fmt(contado)} />
        <Row l={CUADRE_ROW_LABEL[estado]} v={`${descuadre > 0 ? '+' : ''}${fmt(descuadre)}`} bold />
        <hr className="zhr" />
        <Row l="Tickets internos" v={String(k.comprobantes)} />
        <hr className="zhr" />
        <div className="zc" style={{ fontSize: 11, marginTop: 4 }}>Documento interno de control · no válido como comprobante de pago</div>
      </div>
    </div>
  );
}
