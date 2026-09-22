// components/layout/TenantSwitcher.tsx — Selector y visualizador de restaurante/tenant (SaaS Multi-tenant).
// Muestra el restaurante activo y permite alternar entre empresas si el usuario tiene membresías múltiples.
// Al alternar, purga la caché de React Query y reconecta WebSockets al nuevo tenant.

import { useMemo, useRef, useState } from 'react';
import { useAuthStore } from '../../store/auth.store';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Icons } from '../ui/icons';

export function TenantSwitcher() {
  const rawTenants = useAuthStore((s) => s.tenants);
  const tenants = Array.isArray(rawTenants) ? rawTenants : [];
  const activeTenantId = useAuthStore((s) => s.activeTenantId);
  const switchTenant = useAuthStore((s) => s.switchTenant);

  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  useFocusTrap(popRef, { active: open, onClose: () => setOpen(false) });

  const activeSummary = useMemo(
    () => tenants.find((t) => t?.tenant?.id === activeTenantId) ?? tenants[0],
    [tenants, activeTenantId],
  );

  const activeTenantName = activeSummary?.tenant?.nombre ?? 'RestoApp';

  const handleSelect = async (tenantId: string) => {
    if (tenantId === activeTenantId) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      await switchTenant(tenantId);
      setOpen(false);
    } catch {
      // Error manejado en client
    } finally {
      setSwitching(false);
    }
  };

  // Si no hay tenants registrados o solo hay 1, se muestra como indicador
  if (!tenants || tenants.length <= 1) {
    return (
      <div
        className="tenant-chip"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          background: 'var(--bg-card, rgba(0,0,0,0.04))',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 600,
        }}
        title={`Restaurante: ${activeTenantName}`}
      >
        <Icons.Restaurante s={16} />
        <span className="desktop-only">{activeTenantName}</span>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        className={`icon-btn ${open ? 'on' : ''}`}
        onClick={() => setOpen((x) => !x)}
        title="Cambiar de restaurante"
        aria-label={`Restaurante activo: ${activeTenantName}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        style={{ display: 'flex', alignItems: 'center', gap: 6, width: 'auto', padding: '0 10px' }}
      >
        <Icons.Restaurante s={17} />
        <span className="desktop-only" style={{ fontSize: 13, fontWeight: 600 }}>
          {activeTenantName}
        </span>
        <span className="badge badge-muted desktop-only" style={{ fontSize: 10, padding: '2px 5px' }}>
          {tenants.length}
        </span>
      </button>

      {open && (
        <div ref={popRef}>
          <button
            type="button"
            aria-label="Cerrar"
            tabIndex={-1}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 89,
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'default',
              appearance: 'none',
            }}
            onClick={() => setOpen(false)}
          />
          <dialog open className="settings-pop" aria-modal="true" aria-label="Cambiar restaurante">
            <div className="sp-row">
              <span className="sp-lbl">Restaurante / Negocio</span>
              {switching && <div className="muted" style={{ fontSize: 13 }}>Cambiando restaurante…</div>}
              {!switching && (
                <div className="col" style={{ gap: 4 }}>
                  {tenants.map((summary) => {
                    const isSelected = summary.tenant.id === activeTenantId;
                    return (
                      <button
                        key={summary.tenant.id}
                        className={`btn btn-sm ${isSelected ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ justifyContent: 'flex-start', display: 'flex', alignItems: 'center', gap: 8 }}
                        onClick={() => void handleSelect(summary.tenant.id)}
                      >
                        {isSelected ? <Icons.Check s={14} /> : <Icons.Restaurante s={14} />}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                          <span style={{ fontWeight: isSelected ? 700 : 500 }}>{summary.tenant.nombre}</span>
                          <small style={{ fontSize: 11, opacity: 0.75 }}>
                            {summary.rol} · {summary.tenant.plan}
                          </small>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </dialog>
        </div>
      )}
    </div>
  );
}
