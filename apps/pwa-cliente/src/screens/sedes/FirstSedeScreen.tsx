import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSedesQuery } from '../../hooks/queries/useSedesQuery';
import { useAuthStore } from '../../store/auth.store';

/** Primer acceso de un restaurante: todavía no hay operación ni sede seleccionable. */
export function FirstSedeScreen() {
  const navigate = useNavigate();
  const tenantId = useAuthStore((state) => state.activeTenantId);
  const switchTenant = useAuthStore((state) => state.switchTenant);
  const { crearSede, saving } = useSedesQuery();
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [ruc, setRuc] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!tenantId) {
      setError('No se encontró el restaurante de esta sesión. Vuelve a iniciar sesión.');
      return;
    }
    try {
      const sede = await crearSede({ nombre: nombre.trim(), direccion: direccion.trim() || undefined, ruc: ruc.trim() || undefined });
      await switchTenant(tenantId, sede.id);
      navigate('/app/inicio', { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo crear la sede. Inténtalo otra vez.');
    }
  };

  return (
    <div className="first-sede-wrap">
      <div className="first-sede-card">
        <span className="platform-eyebrow">Bienvenido a RestoApp.pe</span>
        <h1>Prepara tu primer local</h1>
        <p>Tu restaurante ya está creado. Registra una sede para activar mesas, pedidos, cocina, caja y las demás áreas.</p>
        {error && <div className="banner err" role="alert">{error}</div>}
        <form className="form-stack" onSubmit={(event) => void submit(event)}>
          <label className="field"><span className="lbl">Nombre de la sede</span><span className="input"><input required value={nombre} onChange={(event) => setNombre(event.target.value)} placeholder="Ej. Local principal" /></span></label>
          <label className="field"><span className="lbl">Dirección</span><span className="input"><input value={direccion} onChange={(event) => setDireccion(event.target.value)} placeholder="Dirección comercial (opcional)" /></span></label>
          <label className="field"><span className="lbl">RUC</span><span className="input"><input value={ruc} onChange={(event) => setRuc(event.target.value)} placeholder="Opcional; podrás configurar más RUC después" /></span></label>
          <button className="btn btn-primary" disabled={saving || !nombre.trim()} type="submit">{saving ? 'Creando sede…' : 'Crear sede y empezar'}</button>
        </form>
      </div>
    </div>
  );
}
