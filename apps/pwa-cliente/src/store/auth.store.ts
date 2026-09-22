// store/auth.store.ts — Zustand store de autenticación y SaaS multi-tenant

import { create } from 'zustand';
import type { LoginRequest, UserDto, UserTenantSummaryDto } from '../types/auth.types';
import * as authApi from '../api/auth.api';
import { clearAuthToken, setUsuarioSedeId, setSedeSeleccionada, setTenantId } from '../api/client';
import { socketService } from '../services/socket.service';
import { queryClient } from '../api/queryClient';

interface AuthState {
  user: UserDto | null;
  authenticated: boolean;
  loading: boolean;
  activeTenantId: string | null;
  tenants: UserTenantSummaryDto[];
}

interface AuthActions {
  login: (req: LoginRequest) => Promise<void>;
  logout: () => void;
  expireSession: () => void;
  restore: () => Promise<void>;
  switchTenant: (tenantId: string, sedeId?: string) => Promise<void>;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  authenticated: false,
  loading: false,
  activeTenantId: null,
  tenants: [],

  login: async (req: LoginRequest) => {
    const user = await authApi.login(req);
    const activeTenantId = user.activeTenantId ?? (user.tenants?.[0]?.tenant.id ?? null);
    const tenants = user.tenants ?? [];
    setTenantId(activeTenantId);
    setUsuarioSedeId(user.sedeId ?? null);
    set({ user, authenticated: true, activeTenantId, tenants });
    void socketService.connect();
  },

  logout: () => {
    void authApi.logout().catch(() => {
      // La sesión puede estar expirada o el backend rechazar logout; el estado local igual debe limpiarse.
    });
    clearAuthToken();
    setUsuarioSedeId(null);
    setSedeSeleccionada(null);
    setTenantId(null);
    queryClient.clear();
    socketService.disconnect();
    set({ user: null, authenticated: false, activeTenantId: null, tenants: [] });
  },

  expireSession: () => {
    clearAuthToken();
    setUsuarioSedeId(null);
    setSedeSeleccionada(null);
    setTenantId(null);
    queryClient.clear();
    socketService.disconnect();
    set({ user: null, authenticated: false, activeTenantId: null, tenants: [] });
  },

  restore: async () => {
    set({ loading: true });
    try {
      const user = await authApi.me();
      const activeTenantId = user.activeTenantId ?? (user.tenants?.[0]?.tenant.id ?? null);
      const tenants = user.tenants ?? [];
      setTenantId(activeTenantId);
      setUsuarioSedeId(user.sedeId ?? null);
      set({ user, authenticated: true, loading: false, activeTenantId, tenants });
      void socketService.connect();
    } catch {
      clearAuthToken();
      setUsuarioSedeId(null);
      setTenantId(null);
      queryClient.clear();
      socketService.disconnect();
      set({ user: null, authenticated: false, loading: false, activeTenantId: null, tenants: [] });
    }
  },

  switchTenant: async (tenantId: string, sedeId?: string) => {
    const res = await authApi.selectTenant({ tenantId, sedeId });
    const effectiveTenantId = res.activeTenantId ?? tenantId;
    setTenantId(effectiveTenantId);
    const targetSedeId = res.activeSedeId ?? res.usuario.sedeId ?? null;
    setUsuarioSedeId(targetSedeId);
    setSedeSeleccionada(targetSedeId);

    // CRITICAL (Phase 5 Gate): Limpiar toda la caché de React Query para
    // que ninguna entidad del tenant anterior persista en memoria.
    queryClient.clear();

    // Reconectar WebSocket al nuevo contexto de tenant
    socketService.disconnect();
    void socketService.connect();

    set((state) => ({
      user: {
        ...(state.user ?? {}),
        ...res.usuario,
        activeTenantId: effectiveTenantId,
        sedeId: targetSedeId,
      } as UserDto,
      activeTenantId: effectiveTenantId,
    }));
  },
}));

