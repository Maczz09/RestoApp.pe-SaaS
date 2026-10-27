import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listBilling } from '../../api/platform.api';
import { PlatformError, PlatformLoading } from './PlatformState';
import { getTenantDomain } from '../../utils/tenantDomain';

type Filter = 'TODOS' | 'VENCIDO' | 'PROXIMO' | 'AL_DIA' | 'SIN_FECHA' | 'SIN_PAGOS' | 'CON_PAGOS';
const money = (cents: number | null) => cents === null ? 'Sin tarifa' : `S/ ${(cents / 100).toFixed(2)}`;
const date = (value: string | null) => value ? new Date(value).toLocaleDateString('es-PE') : 'Sin fecha';
const labels: Record<Filter, string> = { TODOS: 'Todos', VENCIDO: 'Deudores', PROXIMO: 'Próximos a pagar', AL_DIA: 'Al día', SIN_FECHA: 'Sin fecha', SIN_PAGOS: 'Nunca pagaron', CON_PAGOS: 'Con pagos' };

export function PlatformBillingScreen() {
  const [filter, setFilter] = useState<Filter>('TODOS');
  const query = useQuery({ queryKey: ['platform', 'billing'], queryFn: listBilling, refetchInterval: 30_000 });
  if (query.isLoading) return <PlatformLoading label="Cargando cartera" />;
  if (query.isError || !query.data) return <PlatformError title="No se pudo cargar la cartera" onRetry={() => void query.refetch()} />;
  const rows = query.data.data.filter((item) => filter === 'TODOS' || (filter === 'SIN_PAGOS' ? !item.everPaid : filter === 'CON_PAGOS' ? item.everPaid : item.estadoPago === filter));
  return <div className="platform-page">
    <header className="platform-page-head"><div><span className="platform-eyebrow">Control de suscripciones</span><h1>Cobros y vencimientos</h1><p>Seguimiento de pagos registrados manualmente. La fecha de vencimiento determina quién está atrasado o próximo a pagar.</p></div><button className="btn btn-ghost" onClick={() => void query.refetch()}>Actualizar</button></header>
    <div className="platform-billing-kpis"><div className="platform-aside-card"><span>Deudores</span><strong>{query.data.summary.vencidos}</strong></div><div className="platform-aside-card"><span>Próximos (7 días)</span><strong>{query.data.summary.proximos}</strong></div><div className="platform-aside-card"><span>Al día</span><strong>{query.data.summary.alDia}</strong></div><div className="platform-aside-card"><span>Sin fecha</span><strong>{query.data.summary.sinFecha}</strong></div></div>
    <div className="platform-billing-filters" aria-label="Filtrar por estado de pago">{(Object.keys(labels) as Filter[]).map((key) => <button key={key} className={`btn btn-sm ${filter === key ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(key)}>{labels[key]}</button>)}</div>
    <section className="platform-form-section"><div className="platform-section-head"><h2>Restaurantes</h2><span className="badge badge-muted">{rows.length}</span></div>
      <div className="platform-billing-list">{rows.map((item) => <Link className="platform-billing-row" key={item.id} to={`/platform/tenants/${item.id}`}>
        <span><b>{item.nombre}</b><small>{getTenantDomain(item.slug)} · {item.planNombre}</small></span>
        <span><small>Tarifa / ciclo</small><b>{money(item.priceCents)}</b></span>
        <span><small>Próximo vencimiento</small><b>{date(item.nextDueAt)}</b></span>
        <span className={`badge ${item.estadoPago === 'VENCIDO' ? 'badge-warn' : item.estadoPago === 'AL_DIA' ? 'badge-ok' : 'badge-muted'}`}>{labels[item.estadoPago]}</span>
      </Link>)}{rows.length === 0 && <div className="platform-inline-empty">No hay restaurantes en este estado.</div>}</div>
    </section>
  </div>;
}
