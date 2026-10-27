/** Parse exact origins and one DNS-label HTTPS wildcards without allowing arbitrary regex. */
export function parseCorsOrigins(value: string): Array<string | RegExp> {
  const origins = value.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (origins.length === 0) throw new Error('CORS_ORIGIN must contain at least one origin');
  return origins.map((origin) => {
    if (origin.startsWith('https://*.')) {
      const root = origin.slice('https://*.'.length);
      if (!isDnsHostname(root) || !root.includes('.')) throw new Error(`Invalid CORS wildcard: ${origin}`);
      const escaped = root.replace(/\./g, '\\.');
      return new RegExp(`^https://[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.${escaped}$`, 'i');
    }
    let parsed: URL;
    try { parsed = new URL(origin); }
    catch { throw new Error(`Invalid CORS origin: ${origin}`); }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash || origin.includes('*')) {
      throw new Error(`Invalid CORS origin: ${origin}`);
    }
    const localhostDevelopment = process.env.TENANT_LOCALHOST_DEV === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:' && !localhostDevelopment) throw new Error('Production CORS origins must use HTTPS');
    return parsed.origin;
  });
}

function isDnsHostname(host: string): boolean {
  return host.length <= 253 && host.split('.').every((label) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(label));
}
