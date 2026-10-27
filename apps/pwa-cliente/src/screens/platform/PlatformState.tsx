import { Icons } from '../../components/ui/icons';
import type { ReactNode } from 'react';

export function PlatformLoading({ label = 'Cargando información' }: Readonly<{ label?: string }>) {
  return (
    <output className="platform-state platform-state-loading" aria-label={label}>
      <span className="spinner" aria-hidden="true" />
      <p>{label}…</p>
    </output>
  );
}

export function PlatformError({
  title = 'No pudimos cargar la información',
  detail = 'Verifica la conexión con Identidad e inténtalo otra vez.',
  onRetry,
}: Readonly<{ title?: string; detail?: string; onRetry: () => void }>) {
  return (
    <section className="platform-state platform-state-error" role="alert">
      <span className="platform-state-icon"><Icons.Alert s={22} aria-hidden="true" /></span>
      <h2>{title}</h2>
      <p>{detail}</p>
      <button type="button" className="btn btn-ghost" onClick={onRetry}>
        <Icons.Refresh s={16} aria-hidden="true" /> Reintentar
      </button>
    </section>
  );
}

export function PlatformEmpty({
  title,
  detail,
  action,
}: Readonly<{ title: string; detail: string; action?: ReactNode }>) {
  return (
    <section className="platform-state">
      <span className="platform-state-icon"><Icons.Restaurante s={23} aria-hidden="true" /></span>
      <h2>{title}</h2>
      <p>{detail}</p>
      {action}
    </section>
  );
}
