import { useQuery } from '@tanstack/react-query';
import { listarSolicitudesCuenta } from '../../api/solicitudes-cuenta.api';
import { useAuthStore } from '../../store/auth.store';
import { useOnlineStatus } from '../useOnlineStatus';

export function useSolicitudesCuentaQuery() {
  const user = useAuthStore(s => s.user);
  const online = useOnlineStatus();
  const tenantId = user?.activeTenantId, sedeId = user?.activeSedeId ?? user?.sedeId;
  return useQuery({
    queryKey: ['solicitudes-cuenta', tenantId, sedeId], queryFn: listarSolicitudesCuenta,
    enabled: online && Boolean(tenantId && sedeId) && ['ADMIN', 'CAJERO', 'MESERO'].includes(user?.rol ?? ''),
    refetchInterval: 3000, refetchOnWindowFocus: true, retry: 1,
  });
}
