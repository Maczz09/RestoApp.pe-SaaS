import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { BrandLogo } from '../../components/brand/BrandLogo';
import { Icons } from '../../components/ui/icons';
import { NAV_GROUPS } from '../../components/layout/navigation';
import {
  getTenantLiveCash,
  getTenantLiveInventory,
  getTenantLiveOrders,
  getTenantLiveReservations,
  getTenantLiveSales,
  getTenantLiveTables,
  getTenantObservation,
  startTenantObservation,
} from '../../api/platform.api';
import { PlatformError, PlatformLoading } from './PlatformState';

const POLL_MS = 10_000;
const VIEWS = new Set(['inicio', 'mesas', 'pedidos', 'cocina', 'caja', 'reservas', 'inventario', 'reportes', 'usuarios', 'sedes']);
const money = (value: number) => `S/ ${value.toFixed(2)}`;
const dateTime = (value: string) => new Date(value).toLocaleString('es-PE');

function Empty({ label }: Readonly<{ label: string }>) {
  return <p className="tenant-preview-empty">{label}</p>;
}

function Panel({ title, children }: Readonly<{ title: string; children: ReactNode }>) {
  return <section className="tenant-preview-panel"><h2>{title}</h2><div className="tenant-preview-panel-body">{children}</div></section>;
}

function Metric({ label, value }: Readonly<{ label: string; value: string | number }>) {
  return <div className="tenant-preview-metric"><span>{label}</span><strong>{value}</strong></div>;
}

function StateChips({ states }: Readonly<{ states: Record<string, number> | undefined }>) {
  if (!states || Object.keys(states).length === 0) return <Empty label="No hay estados registrados todavía." />;
  return <div className="tenant-preview-states">{Object.entries(states).map(([name, count]) => <span key={name}><b>{count}</b>{name.toLowerCase().replaceAll('_', ' ')}</span>)}</div>;
}

export function TenantAdminViewScreen() {
  const { tenantId = '', view = 'inicio' } = useParams();
  const base = `/platform/tenants/${tenantId}`;
  const [visitId] = useState(() => crypto.randomUUID());
  const access = useQuery({ queryKey: ['platform', 'preview-access', tenantId, visitId], queryFn: () => startTenantObservation(tenantId), enabled: !!tenantId, retry: false, staleTime: Infinity });
  const enabled = !!tenantId && access.isSuccess;
  const identity = useQuery({ queryKey: ['platform', 'preview', tenantId, 'identity'], queryFn: () => getTenantObservation(tenantId), enabled, refetchInterval: POLL_MS });
  const sales = useQuery({ queryKey: ['platform', 'preview', tenantId, 'sales'], queryFn: () => getTenantLiveSales(tenantId), enabled, refetchInterval: POLL_MS });
  const tables = useQuery({ queryKey: ['platform', 'preview', tenantId, 'tables'], queryFn: () => getTenantLiveTables(tenantId), enabled, refetchInterval: POLL_MS });
  const orders = useQuery({ queryKey: ['platform', 'preview', tenantId, 'orders'], queryFn: () => getTenantLiveOrders(tenantId), enabled, refetchInterval: POLL_MS });
  const cash = useQuery({ queryKey: ['platform', 'preview', tenantId, 'cash'], queryFn: () => getTenantLiveCash(tenantId), enabled, refetchInterval: POLL_MS });
  const reservations = useQuery({ queryKey: ['platform', 'preview', tenantId, 'reservations'], queryFn: () => getTenantLiveReservations(tenantId), enabled, refetchInterval: POLL_MS });
  const inventory = useQuery({ queryKey: ['platform', 'preview', tenantId, 'inventory'], queryFn: () => getTenantLiveInventory(tenantId), enabled, refetchInterval: POLL_MS });

  if (!VIEWS.has(view)) return <Navigate to={`${base}/admin/inicio`} replace />;
  if (access.isLoading || identity.isLoading) return <PlatformLoading label="Abriendo vista de auditoría del restaurante" />;
  if (access.isError) return <PlatformError title="No se pudo registrar el acceso de auditoría" onRetry={() => void access.refetch()} />;
  if (identity.isError || !identity.data) return <PlatformError title="No se pudo abrir el restaurante" onRetry={() => void identity.refetch()} />;

  const data = identity.data;
  const title = NAV_GROUPS.flatMap((group) => group.items).find((item) => item.key === view)?.label ?? 'Inicio';
  const serviceError = [sales, tables, orders, cash, reservations, inventory].some((query) => query.isError);
  const recentTables = tables.data?.recientes ?? [];
  const recentOrders = orders.data?.recientes ?? [];
  const recentCash = cash.data?.recientes ?? [];
  const upcoming = reservations.data?.proximas ?? [];
  const losses = inventory.data?.mermasRecientes ?? [];

  return <div className="tenant-preview-shell">
    <a className="skip-link" href="#tenant-preview-content">Saltar al contenido</a>
    <aside className="tenant-preview-sidebar" aria-label="Navegación del restaurante en auditoría">
      <div className="tenant-preview-brand"><BrandLogo variant="icon" height={36} width={36} /><span><b>{data.tenant.nombre}</b><small>Vista de administrador general</small></span></div>
      <nav className="tenant-preview-nav" aria-label="Navegación del restaurante en auditoría">{NAV_GROUPS.map((group) => {
        const items = group.items.filter((item) => VIEWS.has(item.key));
        return <div key={group.group}><p>{group.group}</p>{items.map((item) => { const Icon = Icons[item.icon]; return <Link key={item.key} to={`${base}/admin/${item.key}`} aria-current={view === item.key ? 'page' : undefined} className={view === item.key ? 'is-active' : ''}><Icon s={18} aria-hidden="true" />{item.label}</Link>; })}</div>;
      })}</nav>
      <div className="tenant-preview-sidebar-foot">Solo lectura · los cambios se hacen desde una cuenta del restaurante.</div>
    </aside>
    <div className="tenant-preview-main">
      <header className="tenant-preview-topbar"><div><b>{data.tenant.nombre}</b><small>Administración del negocio · auditoría</small></div><span className="tenant-preview-live"><i /> En vivo</span><Link className="btn btn-ghost btn-sm" to={`${base}/observe`}>Observación</Link><Link className="btn btn-ghost btn-sm" to={base}>Volver a plataforma</Link></header>
      <main id="tenant-preview-content" className="tenant-preview-content" tabIndex={-1}>
        <div className="tenant-preview-intro"><div><span className="platform-eyebrow">{data.tenant.nombre} / {title}</span><h1>{view === 'inicio' ? 'Inicio' : title}</h1><p>Información del restaurante actualizada cada 10 segundos. Esta vista no permite modificaciones.</p></div><span className="badge badge-ok">Solo lectura</span></div>
        {serviceError && <div className="banner warn" role="status">Uno o más servicios no respondieron. Los datos disponibles siguen visibles y se reintentará automáticamente.</div>}
        {view === 'inicio' && <><div className="tenant-preview-kpis"><Metric label="Ventas hoy" value={sales.data?.totalVentas ?? '—'} /><Metric label="Ingresos hoy" value={sales.data ? money(sales.data.ingresosTotales) : '—'} /><Metric label="Mesas" value={tables.data?.total ?? '—'} /><Metric label="Pedidos" value={orders.data?.total ?? '—'} /></div><div className="tenant-preview-grid"><Panel title="Salón ahora"><StateChips states={tables.data?.porEstado} />{recentTables.length ? recentTables.slice(0, 5).map((row) => <div className="tenant-preview-row" key={row.id}><span>Mesa {row.numero}</span><b>{row.estado}</b></div>) : <Empty label="No hay mesas recientes." />}</Panel><Panel title="Pedidos y cocina"><StateChips states={orders.data?.porEstado} />{recentOrders.length ? recentOrders.slice(0, 5).map((row) => <div className="tenant-preview-row" key={row.id}><span>{row.modalidad ?? 'Salón'} · {dateTime(row.updatedAt)}</span><b>{row.estado}</b></div>) : <Empty label="No hay pedidos recientes." />}</Panel><Panel title="Caja"><div className="tenant-preview-inline-metrics"><span><b>{cash.data?.turnosAbiertos ?? '—'}</b> turnos abiertos</span><span><b>{cash.data ? money(cash.data.ingresosUltimas24h) : '—'}</b> últimas 24 h</span></div></Panel><Panel title="Reservas próximas">{upcoming.length ? upcoming.slice(0, 5).map((row) => <div className="tenant-preview-row" key={row.id}><span>{row.fecha.slice(0, 10)} · {row.hora} · {row.numComensales} personas</span><b>{row.estado}</b></div>) : <Empty label="No hay reservas próximas." />}</Panel></div></>}
        {view === 'mesas' && <><div className="tenant-preview-kpis"><Metric label="Mesas" value={tables.data?.total ?? '—'} /><Metric label="Sedes" value={data.sedes.length} /></div><Panel title="Estado del salón"><StateChips states={tables.data?.porEstado} />{recentTables.length ? recentTables.map((row) => <div className="tenant-preview-row" key={row.id}><span>Mesa {row.numero}</span><b>{row.estado}</b></div>) : <Empty label="No hay mesas para mostrar." />}</Panel></>}
        {(view === 'pedidos' || view === 'cocina') && <><div className="tenant-preview-kpis"><Metric label="Pedidos" value={orders.data?.total ?? '—'} /></div><Panel title={view === 'cocina' ? 'Cola de cocina' : 'Pedidos recientes'}><StateChips states={orders.data?.porEstado} />{recentOrders.length ? recentOrders.map((row) => <div className="tenant-preview-row" key={row.id}><span>{row.modalidad ?? 'Salón'} <small>{dateTime(row.updatedAt)}</small></span><b>{row.estado}</b></div>) : <Empty label="No hay pedidos recientes." />}</Panel></>}
        {view === 'caja' && <><div className="tenant-preview-kpis"><Metric label="Turnos abiertos" value={cash.data?.turnosAbiertos ?? '—'} /><Metric label="Pagos en 24 h" value={cash.data?.pagosUltimas24h ?? '—'} /><Metric label="Ingresos en 24 h" value={cash.data ? money(cash.data.ingresosUltimas24h) : '—'} /></div><Panel title="Turnos recientes">{recentCash.length ? recentCash.map((row) => <div className="tenant-preview-row" key={row.id}><span>{row.cajaNombre}<small>{dateTime(row.abiertoAt)}</small></span><b>{row.estado}</b></div>) : <Empty label="No hay turnos recientes." />}</Panel></>}
        {view === 'reservas' && <><div className="tenant-preview-kpis"><Metric label="Reservas" value={reservations.data?.total ?? '—'} /></div><Panel title="Próximas reservas"><StateChips states={reservations.data?.porEstado} />{upcoming.length ? upcoming.map((row) => <div className="tenant-preview-row" key={row.id}><span>{row.fecha.slice(0, 10)} · {row.hora} · {row.numComensales} personas</span><b>{row.estado}</b></div>) : <Empty label="No hay reservas próximas." />}</Panel></>}
        {view === 'inventario' && <><div className="tenant-preview-kpis"><Metric label="Productos" value={inventory.data?.productos ?? '—'} /><Metric label="Sin stock" value={inventory.data?.agotados ?? '—'} /><Metric label="No disponibles" value={inventory.data?.noDisponibles ?? '—'} /></div><Panel title="Mermas recientes">{losses.length ? losses.map((row) => <div className="tenant-preview-row" key={row.id}><span>{row.producto.nombre} · {row.cantidad}<small>{dateTime(row.createdAt)}</small></span><b>{row.origen}</b></div>) : <Empty label="No hay mermas recientes." />}</Panel></>}
        {view === 'reportes' && <><div className="tenant-preview-kpis"><Metric label="Ventas hoy" value={sales.data?.totalVentas ?? '—'} /><Metric label="Ingresos hoy" value={sales.data ? money(sales.data.ingresosTotales) : '—'} /></div><div className="tenant-preview-grid"><Panel title="Top platos">{sales.data?.topPlatos.length ? sales.data.topPlatos.map((row) => <div className="tenant-preview-row" key={row.nombre}>{row.nombre}<b>{row.cantidad}</b></div>) : <Empty label="No hay platos vendidos hoy." />}</Panel><Panel title="Top productos">{sales.data?.topProductos.length ? sales.data.topProductos.map((row) => <div className="tenant-preview-row" key={row.nombre}>{row.nombre}<b>{row.cantidad}</b></div>) : <Empty label="No hay productos vendidos hoy." />}</Panel></div></>}
        {view === 'usuarios' && <Panel title={`Usuarios · ${data.usuarios.length}`}>{data.usuarios.length ? data.usuarios.map((item) => <div className="tenant-preview-row" key={item.usuario.id}><span>{item.usuario.nombre}<small>{item.usuario.email}</small></span><b>{item.rol}</b></div>) : <Empty label="No hay usuarios registrados." />}</Panel>}
        {view === 'sedes' && <Panel title={`Sedes · ${data.sedes.length}`}>{data.sedes.length ? data.sedes.map((sede) => <div className="tenant-preview-row" key={sede.id}>{sede.nombre}<b>{sede.activa ? 'Activa' : 'Inactiva'}</b></div>) : <Empty label="El restaurante aún no tiene sedes." />}</Panel>}
      </main>
    </div>
  </div>;
}
