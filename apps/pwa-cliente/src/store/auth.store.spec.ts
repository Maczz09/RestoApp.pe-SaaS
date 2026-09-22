// @vitest-environment jsdom
import { vi } from 'vitest';
// @ts-nocheck
import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './auth.store';
import * as authApi from '../api/auth.api';
import { socketService } from '../services/socket.service';
import * as clientApi from '../api/client';

vi.mock('../api/auth.api');
vi.mock('../services/socket.service', () => ({
  socketService: { connect: vi.fn(), disconnect: vi.fn() }
}));
vi.mock('../api/client', () => ({
  clearAuthToken: vi.fn(),
  setUsuarioSedeId: vi.fn(),
  setSedeSeleccionada: vi.fn(),
  setTenantId: vi.fn(),
}));
vi.mock('../api/queryClient', () => ({
  queryClient: { clear: vi.fn() },
}));

import { queryClient } from '../api/queryClient';

describe('auth.store', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, authenticated: false, loading: false, activeTenantId: null, tenants: [] });
    vi.clearAllMocks();
  });

  it('login works', async () => {
    const mockUser = { id: '1', nombre: 'Test', roles: [] };
    vi.mocked(authApi.login).mockResolvedValue(mockUser as any);

    await useAuthStore.getState().login({ email: 'test@test.com', password: '123' });

    expect(useAuthStore.getState().user).toEqual(mockUser);
    expect(useAuthStore.getState().authenticated).toBe(true);
    expect(socketService.connect).toHaveBeenCalled();
  });

  it('logout works', async () => {
    vi.mocked(authApi.logout).mockResolvedValue({} as any);
    useAuthStore.setState({ user: { id: '1' } as any, authenticated: true });

    useAuthStore.getState().logout();
    
    // Using immediate check since it resets synchronously
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().authenticated).toBe(false);
    expect(clientApi.clearAuthToken).toHaveBeenCalled();
    expect(queryClient.clear).toHaveBeenCalled();
    expect(socketService.disconnect).toHaveBeenCalled();
  });

  it('expireSession works', () => {
    useAuthStore.setState({ user: { id: '1' } as any, authenticated: true });

    useAuthStore.getState().expireSession();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().authenticated).toBe(false);
    expect(clientApi.clearAuthToken).toHaveBeenCalled();
    expect(queryClient.clear).toHaveBeenCalled();
    expect(socketService.disconnect).toHaveBeenCalled();
  });

  it('restore success', async () => {
    const mockUser = { id: '1', nombre: 'Test', roles: [] };
    vi.mocked(authApi.me).mockResolvedValue(mockUser as any);

    await useAuthStore.getState().restore();

    expect(useAuthStore.getState().user).toEqual(mockUser);
    expect(useAuthStore.getState().authenticated).toBe(true);
    expect(useAuthStore.getState().loading).toBe(false);
    expect(socketService.connect).toHaveBeenCalled();
  });

  it('restore failure', async () => {
    vi.mocked(authApi.me).mockRejectedValue(new Error('Unauthorized'));

    await useAuthStore.getState().restore();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().authenticated).toBe(false);
    expect(useAuthStore.getState().loading).toBe(false);
    expect(clientApi.clearAuthToken).toHaveBeenCalled();
    expect(socketService.disconnect).toHaveBeenCalled();
  });

  it('switchTenant calls api, clears query cache, updates active tenant and reconnects socket', async () => {
    const mockSelectResponse = {
      access_token: 'new-token',
      usuario: { id: 'u-1', nombre: 'Admin Multi', email: 'admin@demo.pe', rol: 'ADMIN', sedeId: 'sede-2' },
      activeTenantId: 'tenant-2',
      activeSedeId: 'sede-2',
    };
    vi.mocked(authApi.selectTenant).mockResolvedValue(mockSelectResponse as any);

    useAuthStore.setState({
      user: { id: 'u-1', nombre: 'Admin Multi', email: 'admin@demo.pe', rol: 'ADMIN', activeTenantId: 'tenant-1' } as any,
      authenticated: true,
      activeTenantId: 'tenant-1',
    });

    await useAuthStore.getState().switchTenant('tenant-2', 'sede-2');

    expect(authApi.selectTenant).toHaveBeenCalledWith({ tenantId: 'tenant-2', sedeId: 'sede-2' });
    expect(clientApi.setTenantId).toHaveBeenCalledWith('tenant-2');
    expect(clientApi.setUsuarioSedeId).toHaveBeenCalledWith('sede-2');
    expect(clientApi.setSedeSeleccionada).toHaveBeenCalledWith('sede-2');
    expect(queryClient.clear).toHaveBeenCalled();
    expect(socketService.disconnect).toHaveBeenCalled();
    expect(socketService.connect).toHaveBeenCalled();
    expect(useAuthStore.getState().activeTenantId).toBe('tenant-2');
    expect(useAuthStore.getState().user?.sedeId).toBe('sede-2');
  });
});

