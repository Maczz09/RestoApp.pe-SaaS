import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  getTenantLiveCash, getTenantLiveInventory, getTenantLiveOrders,
  getTenantLiveReservations, getTenantLiveSales, getTenantLiveTables,
  getTenantObservation, startTenantObservation,
} from '../../api/platform.api';
import { TenantAdminViewScreen } from './TenantAdminViewScreen';

vi.mock('../../api/platform.api', () => ({
  getTenantLiveCash: vi.fn(), getTenantLiveInventory: vi.fn(), getTenantLiveOrders: vi.fn(),
  getTenantLiveReservations: vi.fn(), getTenantLiveSales: vi.fn(), getTenantLiveTables: vi.fn(),
  getTenantObservation: vi.fn(), startTenantObservation: vi.fn(),
}));

function renderView(path = '/platform/tenants/tenant-1/admin/inicio') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/platform/tenants/:tenantId/admin/:view?" element={<TenantAdminViewScreen />} />
  </Routes></MemoryRouter></QueryClientProvider>);
}

describe('vista de administrador del negocio para auditoría', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(startTenantObservation).mockResolvedValue({ started: true });
    vi.mocked(getTenantObservation).mockResolvedValue({
      tenant: { id: 'tenant-1', nombre: 'La Prueba', slug: 'la-prueba', plan: 'ESTANDAR', activo: true, createdAt: '2026-09-22T00:00:00.000Z', domains: [], sedesCount: 1 },
      sedes: [{ id: 'sede-1', nombre: 'Principal', activa: true }],
      usuarios: [{ rol: 'ADMIN', usuario: { id: 'user-1', nombre: 'Ana', email: 'ana@prueba.pe', activo: true } }],
      audit: [], observedAt: '2026-09-22T00:00:00.000Z',
    });
    vi.mocked(getTenantLiveSales).mockResolvedValue({ totalVentas: 3, ingresosTotales: 70, ventasPorHora: [], topPlatos: [], topProductos: [] });
    vi.mocked(getTenantLiveTables).mockResolvedValue({ total: 2, porEstado: { LIBRE: 1, OCUPADA: 1 }, recientes: [] });
    vi.mocked(getTenantLiveOrders).mockResolvedValue({ total: 1, porEstado: { PENDIENTE: 1 }, recientes: [] });
    vi.mocked(getTenantLiveCash).mockResolvedValue({ turnosAbiertos: 1, pagosUltimas24h: 3, ingresosUltimas24h: 70, recientes: [] });
    vi.mocked(getTenantLiveReservations).mockResolvedValue({ total: 0, porEstado: {}, proximas: [] });
    vi.mocked(getTenantLiveInventory).mockResolvedValue({ productos: 4, agotados: 0, noDisponibles: 0, mermasRecientes: [] });
  });

  it('registra la entrada antes de consultar datos y muestra la navegación del negocio', async () => {
    const user = userEvent.setup();
    renderView();
    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
    expect(startTenantObservation).toHaveBeenCalledWith('tenant-1');
    expect(getTenantObservation).toHaveBeenCalledWith('tenant-1');
    expect(screen.getByRole('navigation', { name: 'Navegación del restaurante en auditoría' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /crear|editar|eliminar/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Mesas' }));
    expect(await screen.findByRole('heading', { name: 'Estado del salón' })).toBeInTheDocument();
  });

  it('no consulta datos del tenant si falla el registro de acceso', async () => {
    vi.mocked(startTenantObservation).mockRejectedValue(new Error('Acceso denegado'));
    renderView();
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo registrar el acceso de auditoría');
    expect(getTenantObservation).not.toHaveBeenCalled();
    expect(getTenantLiveCash).not.toHaveBeenCalled();
  });

  it('muestra fallos parciales sin perder las áreas disponibles', async () => {
    vi.mocked(getTenantLiveInventory).mockRejectedValue(new Error('Inventario no responde'));
    renderView();
    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Uno o más servicios no respondieron'));
    expect(screen.getByText('Salón ahora')).toBeInTheDocument();
  });
});
