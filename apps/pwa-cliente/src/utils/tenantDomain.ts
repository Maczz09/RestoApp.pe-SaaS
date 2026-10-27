/** Build-time DNS root shared by every tenant served by this PWA image. */
export function getTenantBaseDomain(): string {
  const domain = (import.meta.env.VITE_TENANT_BASE_DOMAIN ?? 'restoapp.pe').trim().toLowerCase().replace(/\.$/, '');
  if (domain.length > 253 || !domain.includes('.') || !domain.split('.').every((label: string) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(label))) {
    throw new Error('VITE_TENANT_BASE_DOMAIN debe ser un dominio DNS sin protocolo, puerto ni comodín');
  }
  return domain;
}

export function getTenantDomain(slug: string): string {
  return slug ? `${slug}.${getTenantBaseDomain()}` : '';
}
