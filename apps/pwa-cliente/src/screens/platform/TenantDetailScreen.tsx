import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getTenantDomain } from '../../utils/tenantDomain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addTenantDomain,
  getTenant,
  removeTenantDomain,
  setTenantStatus,
  updateTenant,
  updateTenantDomain,
  listPlans,
  listBilling,
  listPayments,
  recordPayment,
  setDueDate,
  startTenantObservation,
} from '../../api/platform.api';
import { ApiError } from '../../api/client';
import { Icons } from '../../components/ui/icons';
import { useToast } from '../../components/ui/ToastProvider';
import type { PlatformTenant } from '../../types/platform.types';
import { formatPlatformDate } from './PlatformDashboardScreen';
import { normalizeTenantDomain, slugifyTenant } from './TenantCreateScreen';
import { PlatformError, PlatformLoading } from './PlatformState';

export function TenantDetailScreen() {
  const { tenantId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ nombre: '', slug: '', ruc: '', plan: 'ESTANDAR' });
  const [domain, setDomain] = useState('');
  const [statusReason, setStatusReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState({ soles: '', periods: '1', method: 'TRANSFERENCIA', reference: '', note: '' });
  const [dueDate, setDueDateValue] = useState('');
  const plansQuery = useQuery({ queryKey: ['platform', 'plans'], queryFn: listPlans });
  const billingQuery = useQuery({ queryKey: ['platform', 'billing'], queryFn: listBilling });
  const paymentsQuery = useQuery({ queryKey: ['platform', 'payments', tenantId], queryFn: () => listPayments(tenantId), enabled: Boolean(tenantId) });

  const tenantQuery = useQuery({
    queryKey: ['platform', 'tenant', tenantId],
    queryFn: () => getTenant(tenantId),
    enabled: Boolean(tenantId),
  });

  useEffect(() => {
    if (!tenantQuery.data) return;
    setForm({
      nombre: tenantQuery.data.nombre,
      slug: tenantQuery.data.slug,
      ruc: tenantQuery.data.ruc ?? '',
      plan: tenantQuery.data.plan,
    });
  }, [tenantQuery.data]);

  const syncTenant = async (tenant?: PlatformTenant) => {
    if (tenant) queryClient.setQueryData(['platform', 'tenant', tenantId], tenant);
    await queryClient.invalidateQueries({ queryKey: ['platform', 'tenants'] });
    await queryClient.invalidateQueries({ queryKey: ['platform', 'summary'] });
    await queryClient.invalidateQueries({ queryKey: ['platform', 'billing'] });
  };

  const savePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(null);
    const amountCents = Math.round(Number(payment.soles) * 100);
    if (!Number.isFinite(amountCents) || amountCents < 0) { setError('Indica un monto válido.'); return; }
    try {
      await recordPayment(tenantId, { amountCents, periods: Number(payment.periods), method: payment.method, reference: payment.reference, note: payment.note });
      setPayment({ soles: '', periods: '1', method: 'TRANSFERENCIA', reference: '', note: '' });
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['platform', 'billing'] }), paymentsQuery.refetch()]);
      toast({ kind: 'ok', title: 'Pago registrado', msg: 'Se actualizó el próximo vencimiento.' });
    } catch (caught) { setError(errorMessage(caught, 'No se pudo registrar el pago.')); }
  };

  const saveDueDate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(null);
    try { await setDueDate(tenantId, new Date(`${dueDate}T12:00:00`).toISOString()); await queryClient.invalidateQueries({ queryKey: ['platform', 'billing'] }); setDueDateValue(''); toast({ kind: 'ok', title: 'Vencimiento actualizado' }); }
    catch (caught) { setError(errorMessage(caught, 'No se pudo ajustar la fecha.')); }
  };

  const updateMutation = useMutation({
    mutationFn: () => updateTenant(tenantId, {
      nombre: form.nombre.trim(),
      slug: slugifyTenant(form.slug),
      ruc: form.ruc.trim() || null,
      plan: form.plan,
    }),
  });
  const statusMutation = useMutation({
    mutationFn: (activo: boolean) => setTenantStatus(tenantId, activo, statusReason),
  });
  const addDomainMutation = useMutation({
    mutationFn: (value: string) => addTenantDomain(tenantId, value),
  });
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      const tenant = await updateMutation.mutateAsync();
      await syncTenant(tenant);
      toast({ kind: 'ok', title: 'Datos actualizados' });
    } catch (caught) {
      setError(errorMessage(caught, 'No se pudieron guardar los cambios.'));
    }
  };

  const changeStatus = async (activo: boolean) => {
    const verb = activo ? 'reactivar' : 'suspender';
    if (!activo && !statusReason.trim()) {
      setError('Indica el motivo antes de suspender el restaurante.');
      document.getElementById('platform-status-reason')?.focus();
      return;
    }
    if (!globalThis.confirm(`¿Deseas ${verb} este restaurante?`)) return;
    setError(null);
    try {
      const tenant = await statusMutation.mutateAsync(activo);
      setStatusReason('');
      await syncTenant(tenant);
      toast({ kind: activo ? 'ok' : 'warn', title: activo ? 'Restaurante reactivado' : 'Restaurante suspendido' });
    } catch (caught) {
      setError(errorMessage(caught, `No se pudo ${verb} el restaurante.`));
    }
  };

  const addDomain = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeTenantDomain(domain);
    if (!normalized) return;
    setError(null);
    try {
      await addDomainMutation.mutateAsync(normalized);
      setDomain('');
      await tenantQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ['platform', 'tenants'] });
      toast({ kind: 'ok', title: 'Dominio agregado', msg: normalized });
    } catch (caught) {
      setError(errorMessage(caught, 'No se pudo agregar el dominio.'));
    }
  };

  const changeDomain = async (domainId: string, action: 'principal' | 'toggle' | 'remove', activo?: boolean) => {
    if (action === 'remove' && !globalThis.confirm('¿Deseas eliminar este dominio?')) return;
    setError(null);
    try {
      if (action === 'remove') {
        await removeTenantDomain(tenantId, domainId);
      } else {
        await updateTenantDomain(tenantId, domainId, action === 'principal' ? { principal: true } : { activo: !activo });
      }
      await tenantQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ['platform', 'tenants'] });
      toast({ kind: 'ok', title: action === 'remove' ? 'Dominio eliminado' : 'Dominio actualizado' });
    } catch (caught) {
      setError(errorMessage(caught, 'No se pudo modificar el dominio.'));
    }
  };

  if (tenantQuery.isLoading) return <PlatformLoading label="Cargando restaurante" />;
  if (tenantQuery.isError || !tenantQuery.data) {
    const notFound = tenantQuery.error instanceof ApiError && tenantQuery.error.status === 404;
    return (
      <PlatformError
        title={notFound ? 'El restaurante no existe' : 'No pudimos cargar el restaurante'}
        detail={notFound ? 'El registro solicitado fue eliminado o no está disponible.' : undefined}
        onRetry={notFound ? () => navigate('/platform/tenants') : () => void tenantQuery.refetch()}
      />
    );
  }

  const tenant = tenantQuery.data;
  const billing = billingQuery.data?.data.find((item) => item.id === tenantId);

  return (
    <div className="platform-page platform-detail-page">
      <div className="platform-breadcrumbs">
        <Link to="/platform/tenants">Restaurantes</Link><span aria-hidden="true">/</span><span>{tenant.nombre}</span>
      </div>

      <header className="platform-page-head platform-detail-head">
        <div>
          <div className="platform-heading-row">
            <h1>{tenant.nombre}</h1>
            <span className={`badge dot ${tenant.activo ? 'badge-ok' : 'badge-warn'}`}>{tenant.activo ? 'Activo' : 'Suspendido'}</span>
          </div>
          <p className="mono">{tenant.id}</p>
        </div>
        <Link className="btn btn-primary" to={`/platform/tenants/${tenantId}/admin/inicio`}>Entrar a la vista del negocio</Link>
        <button type="button" className="btn btn-ghost" onClick={() => void startTenantObservation(tenantId).then(() => navigate(`/platform/tenants/${tenantId}/observe`)).catch((caught: unknown) => setError(errorMessage(caught, 'No se pudo abrir la observación.')))}>Observación resumida</button>
        <button
          type="button"
          className={`btn ${tenant.activo ? 'btn-danger' : 'btn-success'}`}
          disabled={statusMutation.isPending || (tenant.activo && !statusReason.trim())}
          aria-describedby={tenant.activo ? 'platform-status-reason-help' : undefined}
          title={tenant.activo && !statusReason.trim() ? 'Escribe el motivo de suspensión' : undefined}
          onClick={() => void changeStatus(!tenant.activo)}
        >
          {tenant.activo ? <Icons.Lock s={17} /> : <Icons.Unlock s={17} />}
          {tenant.activo ? 'Suspender' : 'Reactivar'}
        </button>
      </header>

      {error && <div className="banner err platform-form-error" role="alert"><Icons.Alert s={17} /> {error}</div>}

      <div className="platform-detail-grid">
        <div className="platform-detail-main">
          <form className="platform-form-section" onSubmit={save}>
            <div className="platform-section-head"><div><h2>Datos del restaurante</h2><p>Nombre, identificador fiscal y plan comercial.</p></div><button className="btn btn-primary btn-sm" disabled={updateMutation.isPending}>{updateMutation.isPending ? 'Guardando…' : 'Guardar cambios'}</button></div>
            <div className="platform-form-grid">
              <label className="field platform-span-2"><span className="lbl">Nombre comercial</span><span className="input"><input value={form.nombre} onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))} required /></span></label>
              <label className="field"><span className="lbl">Slug</span><span className="input"><input value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: slugifyTenant(event.target.value) }))} required pattern="[a-z0-9-]+" /></span></label>
              <label className="field"><span className="lbl">Plan</span><span className="input"><select value={form.plan} onChange={(event) => setForm((current) => ({ ...current, plan: event.target.value }))}>{(plansQuery.data ?? []).filter((plan) => plan.activo || plan.code === form.plan).map((plan) => <option key={plan.code} value={plan.code}>{plan.nombre}</option>)}</select></span></label>
              <label className="field"><span className="lbl">RUC</span><span className="input"><input value={form.ruc} onChange={(event) => setForm((current) => ({ ...current, ruc: event.target.value.replace(/\D/g, '').slice(0, 11) }))} inputMode="numeric" /></span></label>
            </div>
          </form>

          <section className="platform-form-section" aria-labelledby="domains-heading">
            <div className="platform-section-head"><div><h2 id="domains-heading">Dominios y subdominios</h2><p>Direcciones autorizadas para abrir este tenant.</p></div><span className="badge badge-muted">{tenant.domains.length}</span></div>
            <form className="platform-domain-form" onSubmit={addDomain}>
              <label className="field"><span className="lbl">Nuevo dominio</span><span className="input"><input value={domain} onChange={(event) => setDomain(event.target.value)} required pattern="[A-Za-z0-9.-]+" placeholder={getTenantDomain(tenant.slug)} /></span></label>
              <button type="submit" className="btn btn-soft" disabled={addDomainMutation.isPending}><Icons.Plus s={16} /> Agregar</button>
            </form>
            {tenant.domains.length === 0 ? (
              <div className="platform-inline-empty">Este restaurante todavía no tiene un dominio configurado.</div>
            ) : (
              <ul className="platform-domain-list">
                {tenant.domains.map((item) => (
                  <li key={item.id}>
                    <span className={`platform-domain-state ${item.activo ? 'is-active' : ''}`} aria-hidden="true" />
                    <span className="platform-domain-value"><b className="mono">{item.domain}</b><small>{item.principal ? 'Principal' : item.activo ? 'Activo' : 'Desactivado'}</small></span>
                    {!item.principal && <button type="button" className="btn btn-sm btn-ghost" onClick={() => void changeDomain(item.id, 'principal')}>Hacer principal</button>}
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => void changeDomain(item.id, 'toggle', item.activo)}>{item.activo ? 'Desactivar' : 'Activar'}</button>
                    <button type="button" className="icon-btn" onClick={() => void changeDomain(item.id, 'remove')} disabled={item.principal} aria-label={`Eliminar ${item.domain}`} title={item.principal ? 'El dominio principal no se puede eliminar' : 'Eliminar dominio'}><Icons.Close s={16} /></button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="platform-form-section" aria-labelledby="tenant-billing-heading">
            <div className="platform-section-head"><div><h2 id="tenant-billing-heading">Suscripción y pagos</h2><p>Registro manual de cobros; no se realiza ningún cargo automático.</p></div></div>
            <div className="platform-billing-summary"><div><small>Estado</small><b>{billing?.estadoPago ?? 'Cargando'}</b></div><div><small>Próximo vencimiento</small><b>{billing?.nextDueAt ? formatPlatformDate(billing.nextDueAt) : 'Sin fecha'}</b></div><div><small>Tarifa / ciclo</small><b>{billing?.priceCents == null ? 'Sin tarifa' : `S/ ${(billing.priceCents / 100).toFixed(2)}`}</b></div></div>
            <form className="platform-payment-form" onSubmit={(event) => void savePayment(event)}>
              <label className="field"><span className="lbl">Monto recibido (S/)</span><span className="input"><input type="number" min="0" step="0.01" required value={payment.soles} onChange={(event) => setPayment({ ...payment, soles: event.target.value })} /></span></label>
              <label className="field"><span className="lbl">Ciclos pagados</span><span className="input"><input type="number" min="1" max="12" required value={payment.periods} onChange={(event) => setPayment({ ...payment, periods: event.target.value })} /></span></label>
              <label className="field"><span className="lbl">Medio</span><span className="input"><select value={payment.method} onChange={(event) => setPayment({ ...payment, method: event.target.value })}><option value="TRANSFERENCIA">Transferencia</option><option value="YAPE">Yape</option><option value="PLIN">Plin</option><option value="EFECTIVO">Efectivo</option><option value="OTRO">Otro</option></select></span></label>
              <label className="field"><span className="lbl">Referencia</span><span className="input"><input value={payment.reference} onChange={(event) => setPayment({ ...payment, reference: event.target.value })} /></span></label>
              <button className="btn btn-primary">Registrar pago</button>
            </form>
            <form className="platform-due-form" onSubmit={(event) => void saveDueDate(event)}><label className="field"><span className="lbl">Ajustar vencimiento</span><span className="input"><input type="date" required value={dueDate} onChange={(event) => setDueDateValue(event.target.value)} /></span></label><button className="btn btn-ghost">Guardar fecha</button></form>
            <h3>Últimos pagos</h3><div className="platform-payments-list">{(paymentsQuery.data ?? []).slice(0, 8).map((item) => <div key={item.id}><span>{formatPlatformDate(item.paidAt)}</span><b>S/ {(item.amountCents / 100).toFixed(2)}</b><small>{item.method} · {item.periods} ciclo(s){item.reference ? ` · ${item.reference}` : ''}</small></div>)}{paymentsQuery.data?.length === 0 && <p className="muted">Todavía no hay pagos registrados.</p>}</div>
          </section>

          {tenant.activo && (
            <section className="platform-status-note">
              <label className="field" htmlFor="platform-status-reason"><span className="lbl">Motivo de suspensión</span><span className="input"><textarea id="platform-status-reason" value={statusReason} onChange={(event) => setStatusReason(event.target.value)} rows={2} required aria-describedby="platform-status-reason-help" placeholder="Ej. Solicitud del cliente o falta de pago" /></span><small id="platform-status-reason-help">Obligatorio para suspender. Quedará registrado en auditoría.</small></label>
            </section>
          )}
        </div>

        <aside className="platform-detail-aside" aria-label="Resumen del restaurante">
          <section className="platform-aside-card">
            <h2>Resumen</h2>
            <dl className="platform-facts">
              <div><dt>Plan</dt><dd>{tenant.plan}</dd></div>
              <div><dt>Sedes</dt><dd className="num">{tenant.sedesCount}</dd></div>
              <div><dt>Usuarios</dt><dd className="num">{tenant.usuariosCount ?? 0}</dd></div>
              <div><dt>Creado</dt><dd>{formatPlatformDate(tenant.createdAt)}</dd></div>
            </dl>
          </section>
          <section className="platform-aside-card">
            <h2>Administrador</h2>
            {tenant.admin ? <div className="platform-admin-card"><span className="ava">{tenant.admin.nombre.slice(0, 2).toUpperCase()}</span><div><b>{tenant.admin.nombre}</b><a href={`mailto:${tenant.admin.email}`}>{tenant.admin.email}</a>{tenant.admin.telefono && <small>{tenant.admin.telefono}</small>}</div></div> : <p className="muted">Sin administrador asignado.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}

function errorMessage(caught: unknown, fallback: string): string {
  return caught instanceof ApiError && caught.message ? caught.message : fallback;
}
