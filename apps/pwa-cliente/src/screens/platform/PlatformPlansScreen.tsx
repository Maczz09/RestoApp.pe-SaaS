import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPlan, listPlans, updatePlan } from '../../api/platform.api';
import type { PlatformPlan } from '../../types/platform.types';
import { PlatformError, PlatformLoading } from './PlatformState';

const blank = { code: '', nombre: '', descripcion: '', soles: '0', cycleDays: '30' };
const soles = (cents: number) => `S/ ${(cents / 100).toFixed(2)}`;

export function PlatformPlansScreen() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['platform', 'plans'], queryFn: listPlans });
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const mutation = useMutation({ mutationFn: (input: Partial<PlatformPlan>) => editing ? updatePlan(editing, input) : createPlan(input), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['platform', 'plans'] }); setEditing(null); setForm(blank); } });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    const amount = Number(form.soles);
    if (!Number.isFinite(amount) || amount < 0) { setError('El precio debe ser un monto válido en soles.'); return; }
    try { await mutation.mutateAsync({ ...(!editing ? { code: form.code.trim().toUpperCase() } : {}), nombre: form.nombre.trim(), descripcion: form.descripcion.trim(), priceCents: Math.round(amount * 100), cycleDays: Number(form.cycleDays) }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo guardar el plan.'); }
  };

  if (query.isLoading) return <PlatformLoading label="Cargando planes" />;
  if (query.isError) return <PlatformError title="No se pudieron cargar los planes" onRetry={() => void query.refetch()} />;
  const plans = query.data ?? [];
  return <div className="platform-page">
    <header className="platform-page-head"><div><span className="platform-eyebrow">Catálogo comercial</span><h1>Planes</h1><p>Gestiona el precio mensual, duración de ciclo y disponibilidad. Los precios iniciales en cero deben configurarse antes de cobrar.</p></div></header>
    <div className="platform-detail-grid platform-management-grid"><div className="platform-detail-main">
      <section className="platform-form-section"><div className="platform-section-head"><h2>Planes disponibles</h2><span className="badge badge-muted">{plans.length}</span></div>
        <div className="platform-plan-list">{plans.map((plan) => <article className="platform-plan-row platform-catalog-row" key={plan.code}>
          <div><b>{plan.nombre}</b><small className="mono">{plan.code} · {plan.cycleDays} días</small><p>{plan.descripcion || 'Sin descripción'}</p></div>
          <div><strong>{soles(plan.priceCents)}</strong><span className={`badge ${plan.activo ? 'badge-ok' : 'badge-warn'}`}>{plan.activo ? 'Activo' : 'Inactivo'}</span></div>
          <div className="platform-plan-actions"><button className="btn btn-sm btn-ghost" onClick={() => { setEditing(plan.code); setForm({ code: plan.code, nombre: plan.nombre, descripcion: plan.descripcion ?? '', soles: (plan.priceCents / 100).toFixed(2), cycleDays: String(plan.cycleDays) }); }}>Editar</button>
          <button className="btn btn-sm btn-ghost" disabled={mutation.isPending} onClick={() => void updatePlan(plan.code, { activo: !plan.activo }).then(() => qc.invalidateQueries({ queryKey: ['platform', 'plans'] })).catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'No se pudo cambiar el estado.'))}>{plan.activo ? 'Desactivar' : 'Activar'}</button></div>
        </article>)}</div>
      </section>
    </div><aside className="platform-detail-aside"><form className="platform-form-section form-stack platform-management-form" onSubmit={(event) => void submit(event)}><h2>{editing ? `Editar ${editing}` : 'Nuevo plan'}</h2>
      {error && <div className="banner err" role="alert">{error}</div>}
      {!editing && <label className="field"><span className="lbl">Código</span><span className="input"><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="EJ. EMPRESA" /></span></label>}
      <label className="field"><span className="lbl">Nombre</span><span className="input"><input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></span></label>
      <label className="field"><span className="lbl">Descripción</span><span className="input"><input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></span></label>
      <label className="field"><span className="lbl">Precio por ciclo (S/)</span><span className="input"><input type="number" min="0" step="0.01" required value={form.soles} onChange={(e) => setForm({ ...form, soles: e.target.value })} /></span></label>
      <label className="field"><span className="lbl">Días por ciclo</span><span className="input"><input type="number" min="1" max="366" required value={form.cycleDays} onChange={(e) => setForm({ ...form, cycleDays: e.target.value })} /></span></label>
      <button className="btn btn-primary" disabled={mutation.isPending}>Guardar plan</button>{editing && <button type="button" className="btn btn-ghost" onClick={() => { setEditing(null); setForm(blank); }}>Cancelar</button>}
    </form></aside></div>
  </div>;
}
