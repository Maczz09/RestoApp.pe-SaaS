import { useQuery } from '@tanstack/react-query';
import { listarSolicitudesCuenta } from '../../api/solicitudes-cuenta.api';
import { useAuthStore } from '../../store/auth.store';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useSolicitudesSonido } from '../../hooks/useSolicitudesSonido';
import { AlertasSonorasButton } from '../ui/AlertasSonorasButton';

export function SolicitudesCuentaAlerts({ onCobrar }: Readonly<{ onCobrar: (mesaId: string, numero?: string) => void }>) {
  const user = useAuthStore((s) => s.user);
  if (user?.rol !== 'ADMIN' && user?.rol !== 'CAJERO') return null;
  return <SolicitudesActivas onCobrar={onCobrar} tenantId={user.activeTenantId ?? ''} sedeId={user.activeSedeId ?? user.sedeId ?? ''} />;
}

function SolicitudesActivas({ onCobrar, tenantId, sedeId }: Readonly<{ onCobrar: (mesaId: string, numero?: string) => void; tenantId: string; sedeId: string }>) {
  const online = useOnlineStatus();
  const query = useQuery({
    queryKey: ['solicitudes-cuenta', tenantId, sedeId], queryFn: listarSolicitudesCuenta,
    refetchInterval: 3000, refetchOnWindowFocus: true, enabled: online, retry: 1,
  });
  const sonido = useSolicitudesSonido(query.data?.map(s => s.id));
  const sonidoPanel = <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
    <span className="hint">Avisos de cuenta a Caja</span>
    <AlertasSonorasButton activo={sonido.activo} onActivar={sonido.activar} onDesactivar={sonido.desactivar} />
  </div>;
  if (query.error) return <div role="alert" className="banner warn">No se pudieron actualizar las solicitudes de cuenta. <button className="btn btn-sm" onClick={() => void query.refetch()}>Reintentar</button></div>;
  if (!query.data?.length) return sonidoPanel;
  return (
    <>{sonidoPanel}
    <section aria-label="Cuentas solicitadas" className="panel" style={{ padding: 16, marginBottom: 16 }}>
      <h3>Cuentas solicitadas · {query.data.length}</h3>
      <p className="hint">Avisos del salón. Se actualizan cada 3 segundos.</p>
      {query.data.map((solicitud) => (
        <div key={solicitud.id} className="kv" style={{ gap: 10, flexWrap: 'wrap' }}>
          <span><b>{solicitud.numerosMesa?.length ? `Mesa ${solicitud.numerosMesa.join(' + ')}` : solicitud.numeroMesa != null ? `Mesa ${solicitud.numeroMesa}` : 'Mesa con cuenta solicitada'}</b> · {solicitud.solicitadoPorNombre}<br />
            <small>{solicitud.cuentaCorrelativo ?? solicitud.cuentaId.slice(0, 8)} · S/ {solicitud.total.toFixed(2)}</small></span>
          <button className="btn btn-primary btn-sm" disabled={!online} onClick={() => onCobrar(solicitud.mesaId, solicitud.numerosMesa?.length ? solicitud.numerosMesa.join(' + ') : solicitud.numeroMesa == null ? undefined : String(solicitud.numeroMesa))}>Atender cuenta</button>
        </div>
      ))}
    </section></>
  );
}
