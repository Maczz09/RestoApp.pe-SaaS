import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { BrandLogo } from '../../components/brand/BrandLogo';
import { Icons } from '../../components/ui/icons';
import { useAuthStore } from '../../store/auth.store';
import { applyThemeColor, isTheme, nextTheme, type Theme } from '../../utils/theme';

interface PlatformShellProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { to: '/platform', label: 'Resumen', icon: Icons.Inicio, end: true },
  { to: '/platform/tenants', label: 'Restaurantes', icon: Icons.Restaurante, end: true },
  { to: '/platform/plans', label: 'Planes', icon: Icons.Caja, end: true },
  { to: '/platform/billing', label: 'Cobros', icon: Icons.Caja, end: true },
  { to: '/platform/admins', label: 'Superadmins', icon: Icons.Usuarios, end: true },
] as const;

export function PlatformShell({ children }: Readonly<PlatformShellProps>) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    const current = document.documentElement.dataset['theme'];
    return isTheme(current) ? current : 'light';
  });

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const cycleTheme = () => {
    const value = nextTheme(theme);
    document.documentElement.dataset['theme'] = value;
    localStorage.setItem('restoapp-theme', value);
    applyThemeColor(value);
    setTheme(value);
  };

  const initials = user?.nombre
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() ?? 'RA';

  return (
    <div className="platform-shell">
      <a className="skip-link" href="#platform-content">Saltar al contenido</a>

      <aside className={`platform-sidebar ${mobileNavOpen ? 'is-open' : ''}`} aria-label="Navegación de plataforma">
        <div className="platform-brand">
          <BrandLogo variant="full" height={34} />
          <span>Administración SaaS</span>
        </div>

        <nav className="platform-nav">
          <p className="platform-nav-label">Plataforma</p>
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `platform-nav-link${isActive ? ' is-active' : ''}`}
              onClick={() => setMobileNavOpen(false)}
            >
              <Icon s={18} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
          <NavLink
            to="/platform/tenants/new"
            className={({ isActive }) => `platform-nav-link${isActive ? ' is-active' : ''}`}
            onClick={() => setMobileNavOpen(false)}
          >
            <Icons.Plus s={18} aria-hidden="true" />
            <span>Nuevo restaurante</span>
          </NavLink>
        </nav>

        <div className="platform-sidebar-foot">
          <span className="platform-environment"><i /> Plataforma central</span>
          <small>Los datos de cada restaurante permanecen aislados.</small>
        </div>
      </aside>

      {mobileNavOpen && (
        <button
          type="button"
          className="platform-mobile-scrim"
          aria-label="Cerrar navegación"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <div className="platform-main">
        <header className="platform-topbar">
          <button
            type="button"
            className="icon-btn platform-menu-button"
            aria-label="Abrir navegación"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((current) => !current)}
          >
            <Icons.Layers s={18} aria-hidden="true" />
          </button>
          <div className="platform-topbar-context">
            <b>RestoApp.pe</b>
            <span>Control global</span>
          </div>
          <span className="spacer" />
          <button
            type="button"
            className="icon-btn"
            onClick={cycleTheme}
            aria-label="Cambiar tema"
            title="Cambiar tema"
          >
            {theme === 'light' ? <Icons.Moon s={18} /> : <Icons.Sun s={18} />}
          </button>
          <div className="platform-user">
            <span className="ava" aria-hidden="true">{initials}</span>
            <span>
              <b>{user?.nombre ?? 'Superadministrador'}</b>
              <small>Superadministrador</small>
            </span>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            onClick={handleLogout}
          >
            <Icons.Logout s={18} aria-hidden="true" />
          </button>
        </header>

        <main id="platform-content" className="platform-content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
