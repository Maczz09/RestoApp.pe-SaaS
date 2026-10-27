import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/ui/ToastProvider';
import { getTenant, listPlans, listBilling, listPayments } from '../../api/platform.api';
import { TenantDetailScreen } from './TenantDetailScreen';

vi.mock('../../api/platform.api', () => ({
  getTenant: vi.fn(),
  updateTenant: vi.fn(),
  setTenantStatus: vi.fn(),
  addTenantDomain: vi.fn(),
  updateTenantDomain: vi.fn(),
  removeTenantDomain: vi.fn(),
  listPlans: vi.fn(),
  listBilling: vi.fn(),
  listPayments: vi.fn(),
}));

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/platform/tenants/tenant-1']}>
          <Routes><Route path="/platform/tenants/:tenantId" element={<TenantDetailScreen />} /></Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('TenantDetailScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTenant).mockResolvedValue({
      id: 'tenant-1', nombre: 'La Prueba', slug: 'la-prueba', plan: 'ESTANDAR', activo: true,
      createdAt: '2026-09-22T00:00:00.000Z', domains: [], sedesCount: 1, usuariosCount: 1,
      admin: { id: 'admin-1', nombre: 'Ana Torres', email: 'ana@prueba.pe' },
    });
    vi.mocked(listPlans).mockResolvedValue([{ code: 'ESTANDAR', nombre: 'Estándar', descripcion: null, priceCents: 0, cycleDays: 30, activo: true }]);
    vi.mocked(listBilling).mockResolvedValue({ data: [], summary: { vencidos: 0, proximos: 0, alDia: 0, sinFecha: 0, sinPagos: 0, conPagos: 0 } });
    vi.mocked(listPayments).mockResolvedValue([]);
  });

  it('exige un motivo antes de habilitar la suspensión', async () => {
    const user = userEvent.setup();
    renderScreen();

    const suspendButton = await screen.findByRole('button', { name: 'Suspender' });
    expect(suspendButton).toBeDisabled();
    expect(screen.getByText(/Obligatorio para suspender/i)).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /Motivo de suspensión/i }), 'Falta de pago');
    expect(suspendButton).toBeEnabled();
  });
});
