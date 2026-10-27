import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../components/ui/ToastProvider';
import { createTenant, listPlans } from '../../api/platform.api';
import { TenantCreateScreen } from './TenantCreateScreen';

vi.mock('../../api/platform.api', () => ({ createTenant: vi.fn(), listPlans: vi.fn() }));

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/platform/tenants/new']}>
          <Routes>
            <Route path="/platform/tenants/new" element={<TenantCreateScreen />} />
            <Route path="/platform/tenants/:tenantId" element={<div>Detalle creado</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('TenantCreateScreen', () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(listPlans).mockResolvedValue([{ code: 'ESTANDAR', nombre: 'Estándar', descripcion: null, priceCents: 0, cycleDays: 30, activo: true }]); });

  it('crea automáticamente slug y dominio desde el nombre', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.type(screen.getByRole('textbox', { name: /Nombre comercial/i }), 'Mi Ñarcita Perú');
    expect(screen.getByRole('textbox', { name: /Slug/i })).toHaveValue('mi-narcita-peru');
    expect(screen.getByRole('textbox', { name: /Dominio inicial/i })).toHaveValue('mi-narcita-peru.restoapp.pe');
  });

  it('crea y mantiene el dominio anidado al editar el slug manualmente', async () => {
    vi.stubEnv('VITE_TENANT_BASE_DOMAIN', 'restoapp.mavricitas.com');
    const user = userEvent.setup();
    renderScreen();
    await user.type(screen.getByRole('textbox', { name: /Nombre comercial/i }), 'Mi Ñarcita');
    expect(screen.getByRole('textbox', { name: /Dominio inicial/i })).toHaveValue('mi-narcita.restoapp.mavricitas.com');
    await user.clear(screen.getByRole('textbox', { name: /Slug/i }));
    await user.type(screen.getByRole('textbox', { name: /Slug/i }), 'sede-lima');
    expect(screen.getByRole('textbox', { name: /Dominio inicial/i })).toHaveValue('sede-lima.restoapp.mavricitas.com');
  });

  it('envía administrador y dominio sin crear sede todavía', async () => {
    vi.mocked(createTenant).mockResolvedValue({
      id: 'tenant-1', nombre: 'Mi Ñarcita', slug: 'mi-narcita', plan: 'ESTANDAR', activo: true,
      createdAt: '2026-09-22T00:00:00.000Z', domains: [], sedesCount: 0, usuariosCount: 1,
    });
    const user = userEvent.setup();
    renderScreen();

    await user.type(screen.getByRole('textbox', { name: /Nombre comercial/i }), 'Mi Ñarcita');
    await user.type(screen.getByRole('textbox', { name: /Nombre completo/i }), 'Ana Torres');
    await user.type(screen.getByRole('textbox', { name: /^Correo$/i }), 'ANA@RESTO.PE');
    await user.type(screen.getByLabelText(/Contraseña temporal/i), 'segura123');
    await user.click(screen.getByRole('button', { name: /Crear restaurante/i }));

    await waitFor(() => expect(createTenant).toHaveBeenCalled());
    expect(vi.mocked(createTenant).mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      nombre: 'Mi Ñarcita',
      slug: 'mi-narcita',
      domain: 'mi-narcita.restoapp.pe',
      administrador: expect.objectContaining({ nombre: 'Ana Torres', email: 'ana@resto.pe', password: 'segura123' }),
    }));
    expect(vi.mocked(createTenant).mock.calls[0]?.[0]).not.toHaveProperty('sede');
    expect(await screen.findByText('Detalle creado')).toBeInTheDocument();
  }, 10_000);
});
