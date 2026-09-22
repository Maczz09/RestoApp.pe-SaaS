// @ts-nocheck
// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenantSwitcher } from './TenantSwitcher';

const mockSwitchTenant = vi.fn();
let mockTenants = [];
let mockActiveTenantId: string | null = null;

vi.mock('../../store/auth.store', () => ({
  useAuthStore: (selector: any) =>
    selector({
      tenants: mockTenants,
      activeTenantId: mockActiveTenantId,
      switchTenant: mockSwitchTenant,
    }),
}));

describe('TenantSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTenants = [
      {
        tenant: { id: 't-1', nombre: 'Restaurante Central', slug: 'central', plan: 'PRO', activo: true, createdAt: '' },
        membershipId: 'm-1',
        rol: 'ADMIN',
        sedes: [],
      },
    ];
    mockActiveTenantId = 't-1';
  });

  it('muestra chip estático cuando hay un solo restaurante', () => {
    render(<TenantSwitcher />);
    expect(screen.getByText('Restaurante Central')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cambiar restaurante/i })).not.toBeInTheDocument();
  });

  it('permite abrir selector cuando hay múltiples membresías y cambiar de tenant', async () => {
    mockTenants = [
      {
        tenant: { id: 't-1', nombre: 'Restaurante Central', slug: 'central', plan: 'PRO', activo: true, createdAt: '' },
        membershipId: 'm-1',
        rol: 'ADMIN',
        sedes: [],
      },
      {
        tenant: { id: 't-2', nombre: 'Parrillas El Gaucho', slug: 'el-gaucho', plan: 'ENTERPRISE', activo: true, createdAt: '' },
        membershipId: 'm-2',
        rol: 'ADMIN',
        sedes: [],
      },
    ];

    render(<TenantSwitcher />);

    const trigger = screen.getByRole('button', { name: /Restaurante activo: Restaurante Central/i });
    expect(trigger).toBeInTheDocument();

    fireEvent.click(trigger);

    expect(screen.getByText('Restaurante / Negocio')).toBeInTheDocument();
    expect(screen.getByText('Parrillas El Gaucho')).toBeInTheDocument();

    const secondOption = screen.getByText('Parrillas El Gaucho');
    fireEvent.click(secondOption);

    await waitFor(() => {
      expect(mockSwitchTenant).toHaveBeenCalledWith('t-2');
    });
  });
});
