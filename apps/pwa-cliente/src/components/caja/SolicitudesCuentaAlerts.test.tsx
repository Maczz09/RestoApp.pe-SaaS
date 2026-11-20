// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SolicitudesCuentaAlerts } from './SolicitudesCuentaAlerts';
import { listarSolicitudesCuenta } from '../../api/solicitudes-cuenta.api';

let rol = 'CAJERO';
vi.mock('../../store/auth.store', () => ({ useAuthStore: (selector: any) => selector({ user: { rol, activeTenantId: 'tenant', activeSedeId: 'branch' } }) }));
vi.mock('../../hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }));
vi.mock('../../api/solicitudes-cuenta.api', () => ({ listarSolicitudesCuenta: vi.fn() }));
const solicitud = { id: 'r', cuentaId: 'account', mesaId: 'table', numeroMesa: 3, total: 70, solicitadaAt: '2026-11-19T15:00:00Z', solicitadoPorNombre: 'Mesero', cuentaCorrelativo: 'A0000001' };
let query: QueryClient;
function renderAlerts(onCobrar = vi.fn()) {
  query = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={query}><SolicitudesCuentaAlerts onCobrar={onCobrar} /></QueryClientProvider>);
}
describe('REST-106 cashier live account requests', () => {
  it('identifies the united table group and keeps that label when opening payment', async () => {
    vi.mocked(listarSolicitudesCuenta).mockResolvedValue([{ ...solicitud, numerosMesa:[3,4] }]);
    const onCobrar=vi.fn(); renderAlerts(onCobrar);
    await screen.findByText('Mesa 3 + 4');
    fireEvent.click(screen.getByRole('button',{name:'Atender cuenta'}));
    expect(onCobrar).toHaveBeenCalledWith('table','3 + 4');
  });
  beforeEach(() => { rol = 'CAJERO'; vi.mocked(listarSolicitudesCuenta).mockResolvedValue([solicitud]); });
  afterEach(() => { query?.clear(); vi.clearAllMocks(); });
  it('shows waiter request and opens the existing direct payment flow', async () => {
    const onCobrar = vi.fn(); renderAlerts(onCobrar);
    await screen.findByText('Cuentas solicitadas · 1');
    expect(screen.getByText('Mesa 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Atender cuenta' }));
    expect(onCobrar).toHaveBeenCalledWith('table', '3');
  });
  it('removes a request after the server reports its account no longer active', async () => {
    renderAlerts(); await screen.findByText('Cuentas solicitadas · 1');
    vi.mocked(listarSolicitudesCuenta).mockResolvedValue([]);
    await act(async () => { await query.refetchQueries({ queryKey: ['solicitudes-cuenta'] }); });
    await waitFor(() => expect(screen.queryByLabelText('Cuentas solicitadas')).not.toBeInTheDocument());
  });
  it('does not fetch cashier alerts for a waiter', () => {
    rol = 'MESERO'; renderAlerts(); expect(listarSolicitudesCuenta).not.toHaveBeenCalled();
  });
});
