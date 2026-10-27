import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Icons } from '../../components/ui/icons';
import { getPlatformSummary, listTenants, listBilling, listPlans } from '../../api/platform.api';
import type { PlatformTenant } from '../../types/platform.types';
import { PlatformEmpty, PlatformError, PlatformLoading } from './PlatformState';

type EstadoFiltro = 'todos' | 'activos' | 'suspendidos';

export function formatPlatformDate(value: string): string {
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function TenantRow({ tenant }: Readonly<{ tenant: PlatformTenant }>) {
  const primaryDomain = tenant.domains.find((domain) => domain.principal) ?? tenant.domains[0];
  return (
    <tr>
      <td data-label="Restaurante">
        <div className="platform-tenant-name">
          <span className="platform-tenant-mark" aria-hidden="true">{tenant.nombre.slice(0, 1).toUpperCase()}</span>
          <span>
            <b>{tenant.nombre}</b>
            <small>{tenant.slug}</small>
          </span>
        </div>
      </td>
      <td data-label="Estado">
        <span className={`badge dot ${tenant.activo ? 'badge-ok' : 'badge-warn'}`}>
          {tenant.activo ? 'Activo' : 'Suspendido'}
        </span>
      </td>
      <td data-label="Plan"><span className="platform-plan">{tenant.plan}</span></td>
      <td data-label="Dominio">
        {primaryDomain ? <span className="mono platform-domain">{primaryDomain.domain}</span> : <span className="muted">Sin dominio</span>}
      </td>
      <td data-label="Sedes" className="num">{tenant.sedesCount}</td>
      <td data-label="Usuarios" className="num">{tenant.usuariosCount ?? 0}</td>
      <td data-label="Alta">{formatPlatformDate(tenant.createdAt)}</td>
      <td className="platform-row-action">
        <Link className="btn btn-sm btn-ghost" to={`/platform/tenants/${tenant.id}`} aria-label={`Administrar ${tenant.nombre}`}>
          Administrar
        </Link>
      </td>
    </tr>
  );
}

export function PlatformDashboardScreen() {
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [estado, setEstado] = useState<EstadoFiltro>('todos');
  const [plan, setPlan] = useState('');

  const summaryQuery = useQuery({
    queryKey: ['platform', 'summary'],
    queryFn: getPlatformSummary,
  });
  const tenantsQuery = useQuery({
    queryKey: ['platform', 'tenants', search, estado, plan],
    queryFn: () => listTenants({ search, estado, plan, limit: 100 }),
  });
  const billingQuery = useQuery({ queryKey: ['platform', 'billing'], queryFn: listBilling, refetchInterval: 30_000 });
  const plansQuery = useQuery({ queryKey: ['platform', 'plans'], queryFn: listPlans });

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(searchDraft.trim());
  };

  const refetchAll = () => {
    void summaryQuery.refetch();
    void tenantsQuery.refetch();
    void billingQuery.refetch();
  };

  const tenants = tenantsQuery.data?.data ?? [];
  const summary = summaryQuery.data;
  const hasFilters = Boolean(search || plan || estado !== 'todos');

  return (
    <div className="platform-page">
      <header className="platform-page-head">
        <div>
          <span className="platform-eyebrow">Plataforma</span>
          <h1>Control de restaurantes</h1>
          <p>Alta, estado y acceso de todos los clientes de RestoApp.pe.</p>
        </div>
        <Link className="btn btn-primary" to="/platform/tenants/new">
          <Icons.Plus s={17} aria-hidden="true" /> Nuevo restaurante
        </Link>
      </header>

      {summaryQuery.isLoading ? (
        <div className="platform-summary-grid" aria-label="Cargando resumen">
          {Array.from({ length: 4 }, (_, index) => <div className="platform-summary-card skel" key={index} />)}
        </div>
      ) : summaryQuery.isError || !summary ? (
        <PlatformError title="No pudimos cargar el resumen" onRetry={refetchAll} />
      ) : (
        <section className="platform-summary-grid" aria-label="Resumen de plataforma">
          <article className="platform-summary-card">
            <span>Restaurantes activos</span>
            <strong className="num">{summary.tenantsActivos}</strong>
            <small>{summary.totalTenants} registrados</small>
          </article>
          <article className="platform-summary-card">
            <span>Sedes</span>
            <strong className="num">{summary.totalSedes}</strong>
            <small>En toda la plataforma</small>
          </article>
          <article className="platform-summary-card">
            <span>Usuarios</span>
            <strong className="num">{summary.totalUsuarios}</strong>
            <small>Con acceso registrado</small>
          </article>
          <article className={`platform-summary-card ${summary.tenantsConIncidencias > 0 ? 'has-warning' : ''}`}>
            <span>Requieren atención</span>
            <strong className="num">{summary.tenantsConIncidencias}</strong>
            <small>{summary.tenantsSuspendidos} suspendidos · {summary.tenantsEnOnboarding} en alta</small>
          </article>
          <Link className="platform-summary-card platform-summary-link" to="/platform/billing">
            <span>Deudores</span><strong className="num">{billingQuery.data?.summary.vencidos ?? '—'}</strong><small>Ver cartera vencida</small>
          </Link>
          <Link className="platform-summary-card platform-summary-link" to="/platform/billing">
            <span>Próximos a pagar</span><strong className="num">{billingQuery.data?.summary.proximos ?? '—'}</strong><small>Vencen en siete días</small>
          </Link>
        </section>
      )}

      <section className="platform-tenants-panel" id="tenants" aria-labelledby="tenants-heading">
        <div className="platform-panel-head">
          <div>
            <h2 id="tenants-heading">Restaurantes</h2>
            <p>{tenants.length} resultados en esta vista</p>
          </div>
          <button
            type="button"
            className={`icon-btn ${tenantsQuery.isFetching ? 'spin' : ''}`}
            onClick={() => void tenantsQuery.refetch()}
            aria-label="Actualizar restaurantes"
          >
            <Icons.Refresh s={17} className="ic" aria-hidden="true" />
          </button>
        </div>

        <div className="platform-toolbar">
          <form className="platform-search" onSubmit={submitSearch} role="search">
            <Icons.Search s={17} aria-hidden="true" />
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Buscar por nombre, slug o RUC"
              aria-label="Buscar restaurantes"
            />
            <button type="submit" className="btn btn-sm btn-soft">Buscar</button>
          </form>

          <div className="seg sm" aria-label="Filtrar por estado">
            {(['todos', 'activos', 'suspendidos'] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={estado === item ? 'on' : ''}
                onClick={() => setEstado(item)}
                aria-pressed={estado === item}
              >
                {item === 'todos' ? 'Todos' : item === 'activos' ? 'Activos' : 'Suspendidos'}
              </button>
            ))}
          </div>

          <label className="platform-inline-field">
            <span>Plan</span>
            <select value={plan} onChange={(event) => setPlan(event.target.value)}>
              <option value="">Todos</option>
              {(plansQuery.data ?? []).map((item) => <option key={item.code} value={item.code}>{item.nombre}</option>)}
            </select>
          </label>
        </div>

        {tenantsQuery.isLoading ? (
          <PlatformLoading label="Cargando restaurantes" />
        ) : tenantsQuery.isError ? (
          <PlatformError onRetry={() => void tenantsQuery.refetch()} />
        ) : tenants.length === 0 ? (
          <PlatformEmpty
            title={hasFilters ? 'No hay coincidencias' : 'Aún no hay restaurantes'}
            detail={hasFilters ? 'Ajusta los filtros o cambia el término de búsqueda.' : 'Crea el primer restaurante; su propietario configurará la sede inicial.'}
            action={!hasFilters ? <Link className="btn btn-primary" to="/platform/tenants/new">Crear restaurante</Link> : undefined}
          />
        ) : (
          <div className="platform-table-wrap">
            <table className="platform-table">
              <thead>
                <tr>
                  <th>Restaurante</th>
                  <th>Estado</th>
                  <th>Plan</th>
                  <th>Dominio</th>
                  <th>Sedes</th>
                  <th>Usuarios</th>
                  <th>Alta</th>
                  <th><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>{tenants.map((tenant) => <TenantRow tenant={tenant} key={tenant.id} />)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
