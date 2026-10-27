import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createTenant, listPlans } from '../../api/platform.api';
import { ApiError } from '../../api/client';
import { Icons } from '../../components/ui/icons';
import { useToast } from '../../components/ui/ToastProvider';
import type { CreatePlatformTenantRequest } from '../../types/platform.types';
import { getTenantBaseDomain, getTenantDomain } from '../../utils/tenantDomain';

export function slugifyTenant(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function normalizeTenantDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}

const INITIAL_FORM = {
  nombre: '',
  slug: '',
  ruc: '',
  plan: 'ESTANDAR',
  domain: '',
  adminNombre: '',
  adminEmail: '',
  adminTelefono: '',
  adminPassword: '',
};

export function TenantCreateScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState(INITIAL_FORM);
  const [slugEdited, setSlugEdited] = useState(false);
  const [domainEdited, setDomainEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const mutation = useMutation({ mutationFn: createTenant });
  const plansQuery = useQuery({ queryKey: ['platform', 'plans'], queryFn: listPlans });

  const setField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const onNameChange = (value: string) => {
    setForm((current) => ({
      ...current,
      nombre: value,
      slug: slugEdited ? current.slug : slugifyTenant(value),
      domain: domainEdited ? current.domain : getTenantDomain(slugEdited ? current.slug : slugifyTenant(value)),
    }));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (form.adminPassword.length < 8) {
      setError('La contraseña del administrador debe tener al menos 8 caracteres.');
      return;
    }

    const payload: CreatePlatformTenantRequest = {
      nombre: form.nombre.trim(),
      slug: slugifyTenant(form.slug),
      plan: form.plan,
      ...(form.ruc.trim() ? { ruc: form.ruc.trim() } : {}),
      ...(form.domain.trim() ? { domain: normalizeTenantDomain(form.domain) } : {}),
      administrador: {
        nombre: form.adminNombre.trim(),
        email: form.adminEmail.trim().toLowerCase(),
        password: form.adminPassword,
        ...(form.adminTelefono.trim() ? { telefono: form.adminTelefono.trim() } : {}),
      },
    };

    try {
      const tenant = await mutation.mutateAsync(payload);
      await queryClient.invalidateQueries({ queryKey: ['platform'] });
      toast({
        kind: 'ok',
        title: 'Restaurante creado',
        msg: `${tenant.nombre} ya tiene administrador y subdominio. El propietario creará su primera sede.`,
      });
      navigate(`/platform/tenants/${tenant.id}`, { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError && caught.message
        ? caught.message
        : 'No se pudo crear el restaurante. Revisa los datos e inténtalo otra vez.');
    }
  };

  return (
    <div className="platform-page platform-form-page">
      <div className="platform-breadcrumbs">
        <Link to="/platform/tenants">Restaurantes</Link>
        <span aria-hidden="true">/</span>
        <span>Nuevo</span>
      </div>

      <header className="platform-page-head">
        <div>
          <span className="platform-eyebrow">Alta de cliente</span>
          <h1>Nuevo restaurante</h1>
          <p>Se crearán el restaurante, su administrador y el subdominio. El propietario configurará su primera sede al entrar.</p>
        </div>
      </header>

      {error && <div className="banner err platform-form-error" role="alert"><Icons.Alert s={17} /> {error}</div>}

      <form className="platform-form" onSubmit={submit}>
        <fieldset className="platform-form-section">
          <legend>
            <span>1</span>
            <span><b>Empresa</b><small>Identidad comercial y plan contratado</small></span>
          </legend>
          <div className="platform-form-grid">
            <label className="field platform-span-2">
              <span className="lbl">Nombre comercial</span>
              <span className="input"><input value={form.nombre} onChange={(event) => onNameChange(event.target.value)} required autoFocus placeholder="Ej. Restaurante El Puerto" /></span>
            </label>
            <label className="field">
              <span className="lbl">Slug</span>
              <span className="input platform-prefix-input"><input value={form.slug} onChange={(event) => { const slug = event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+/, '').slice(0, 48); setSlugEdited(true); setForm((current) => ({ ...current, slug, domain: domainEdited ? current.domain : getTenantDomain(slugifyTenant(slug)) })); }} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /><span>.{getTenantBaseDomain()}</span></span>
            </label>
            <label className="field">
              <span className="lbl">Plan</span>
              <span className="input"><select value={form.plan} onChange={(event) => setField('plan', event.target.value)}>{(plansQuery.data ?? []).filter((plan) => plan.activo).map((plan) => <option key={plan.code} value={plan.code}>{plan.nombre}</option>)}</select></span>
            </label>
            <label className="field">
              <span className="lbl">RUC de la empresa <i>opcional</i></span>
              <span className="input"><input value={form.ruc} onChange={(event) => setField('ruc', event.target.value.replace(/\D/g, '').slice(0, 11))} inputMode="numeric" placeholder="20123456789" /></span>
            </label>
            <label className="field">
              <span className="lbl">Dominio inicial</span>
              <span className="input"><input value={form.domain} onChange={(event) => { setDomainEdited(true); setField('domain', event.target.value); }} placeholder={getTenantDomain('restaurante')} pattern="[A-Za-z0-9.-]+" /></span>
            </label>
          </div>
        </fieldset>

        <fieldset className="platform-form-section">
          <legend>
            <span>2</span>
            <span><b>Administrador propietario</b><small>Primer usuario con control del restaurante</small></span>
          </legend>
          <div className="platform-form-grid">
            <label className="field">
              <span className="lbl">Nombre completo</span>
              <span className="input"><input value={form.adminNombre} onChange={(event) => setField('adminNombre', event.target.value)} required autoComplete="name" /></span>
            </label>
            <label className="field">
              <span className="lbl">Correo</span>
              <span className="input"><input type="email" value={form.adminEmail} onChange={(event) => setField('adminEmail', event.target.value)} required autoComplete="email" /></span>
            </label>
            <label className="field">
              <span className="lbl">Teléfono <i>opcional</i></span>
              <span className="input"><input value={form.adminTelefono} onChange={(event) => setField('adminTelefono', event.target.value)} inputMode="tel" autoComplete="tel" /></span>
            </label>
            <label className="field">
              <span className="lbl">Contraseña temporal</span>
              <span className="input"><input type={showPassword ? 'text' : 'password'} value={form.adminPassword} onChange={(event) => setField('adminPassword', event.target.value)} required minLength={8} autoComplete="new-password" /><button type="button" className="platform-input-action" onClick={() => setShowPassword((current) => !current)}>{showPassword ? 'Ocultar' : 'Mostrar'}</button></span>
            </label>
          </div>
        </fieldset>

        <div className="platform-form-actions">
          <Link className="btn btn-ghost" to="/platform/tenants">Cancelar</Link>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
            {mutation.isPending ? <><span className="spinner" /> Creando…</> : <><Icons.Check s={17} /> Crear restaurante</>}
          </button>
        </div>
      </form>
    </div>
  );
}
