import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createPlatformAdmin, listPlatformAdmins, resetPlatformAdminPassword, setPlatformAdminStatus } from '../../api/platform.api';
import { useAuthStore } from '../../store/auth.store';
import { PlatformError, PlatformLoading } from './PlatformState';

export function PlatformAdminsScreen() {
  const ownId = useAuthStore((state) => state.user?.id);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['platform', 'admins'], queryFn: listPlatformAdmins });
  const [form, setForm] = useState({ nombre: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetId, setResetId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['platform', 'admins'] });
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setBusy(true);
    try { await createPlatformAdmin(form); setForm({ nombre: '', email: '', password: '' }); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo crear la cuenta.'); }
    finally { setBusy(false); }
  };
  const toggle = async (id: string, activo: boolean) => {
    if (!confirm(`¿${activo ? 'Desactivar' : 'Activar'} esta cuenta de plataforma?`)) return;
    setError(''); setBusy(true);
    try { await setPlatformAdminStatus(id, !activo); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo cambiar el estado.'); }
    finally { setBusy(false); }
  };
  const reset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetId) return;
    setError(''); setBusy(true);
    try { await resetPlatformAdminPassword(resetId, newPassword); setResetId(null); setNewPassword(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo cambiar la contraseña.'); }
    finally { setBusy(false); }
  };
  if (query.isLoading) return <PlatformLoading label="Cargando superadministradores" />;
  if (query.isError) return <PlatformError title="No se pudieron cargar las cuentas" onRetry={() => void query.refetch()} />;
  return <div className="platform-page"><header className="platform-page-head"><div><span className="platform-eyebrow">Seguridad de plataforma</span><h1>Superadministradores</h1><p>Accesos globales a RestoApp.pe. La desactivación revoca las sesiones y queda registrada en auditoría.</p></div></header>
    {error && <div className="banner err" role="alert">{error}</div>}
    <div className="platform-detail-grid platform-management-grid"><div className="platform-detail-main"><section className="platform-form-section"><div className="platform-section-head"><h2>Cuentas</h2><span className="badge badge-muted">{query.data?.length ?? 0}</span></div><div className="platform-admin-list">{(query.data ?? []).map((admin) => <div className="platform-admin-row" key={admin.id}><div className="platform-admin-identity"><b>{admin.nombre}</b><small>{admin.email}</small></div>{admin.id === ownId && <span className="badge badge-muted">Tu cuenta</span>}<span className={`badge ${admin.activo ? 'badge-ok' : 'badge-warn'}`}>{admin.activo ? 'Activo' : 'Inactivo'}</span><div className="platform-admin-actions"><button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setResetId(admin.id); setNewPassword(''); }}>Cambiar clave</button><button className="btn btn-ghost btn-sm" disabled={busy || admin.id === ownId} onClick={() => void toggle(admin.id, admin.activo)}>{admin.activo ? 'Desactivar' : 'Activar'}</button></div></div>)}</div>
      {resetId && <form className="platform-due-form" onSubmit={(event) => void reset(event)}><label className="field"><span className="lbl">Nueva contraseña</span><span className="input"><input type="password" minLength={12} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" /></span></label><button className="btn btn-primary" disabled={busy}>Guardar nueva clave</button><button className="btn btn-ghost" type="button" onClick={() => setResetId(null)}>Cancelar</button></form>}
    </section></div>
      <aside className="platform-detail-aside"><form className="platform-form-section form-stack platform-management-form" onSubmit={(event) => void create(event)}><h2>Nuevo superadministrador</h2><label className="field"><span className="lbl">Nombre</span><span className="input"><input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></span></label><label className="field"><span className="lbl">Correo</span><span className="input"><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></span></label><label className="field"><span className="lbl">Contraseña inicial</span><span className="input"><input type="password" minLength={12} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></span></label><button className="btn btn-primary" disabled={busy}>Crear cuenta</button></form></aside>
    </div></div>;
}
