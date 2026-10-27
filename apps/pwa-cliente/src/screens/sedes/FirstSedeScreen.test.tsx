import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FirstSedeScreen } from './FirstSedeScreen';
import { useSedesQuery } from '../../hooks/queries/useSedesQuery';
import { useAuthStore } from '../../store/auth.store';

vi.mock('../../hooks/queries/useSedesQuery', () => ({ useSedesQuery: vi.fn() }));
vi.mock('../../store/auth.store', () => ({ useAuthStore: vi.fn() }));

describe('FirstSedeScreen', () => {
  const crearSede = vi.fn().mockResolvedValue({ id: 'sede-nueva', nombre: 'Principal' });
  const switchTenant = vi.fn().mockResolvedValue(undefined);
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSedesQuery).mockReturnValue({ crearSede, saving: false } as never);
    vi.mocked(useAuthStore).mockImplementation((selector: never) => (selector as (state: unknown) => unknown)({ activeTenantId: 'tenant-1', switchTenant }) as never);
  });

  it('crea la primera sede y renueva el contexto antes de mostrar Inicio', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/app/sedes']}><Routes><Route path="/app/sedes" element={<FirstSedeScreen />} /><Route path="/app/inicio" element={<div>Inicio operativo</div>} /></Routes></MemoryRouter>);
    await user.type(screen.getByRole('textbox', { name: 'Nombre de la sede' }), 'Principal');
    await user.click(screen.getByRole('button', { name: 'Crear sede y empezar' }));
    await waitFor(() => expect(crearSede).toHaveBeenCalledWith({ nombre: 'Principal', direccion: undefined, ruc: undefined }));
    expect(switchTenant).toHaveBeenCalledWith('tenant-1', 'sede-nueva');
    expect(await screen.findByText('Inicio operativo')).toBeInTheDocument();
  });
});
