/**
 * API base URL helper.
 *
 * Default: same-origin `/api/...` on Vercel so session cookies work for
 * customers AND admin (login, orders, payment confirm).
 *
 * Optional: set VITE_API_BASE_URL=https://vura-market.fly.dev only if you
 * intentionally want the Fly gateway (requires SameSite=None cookies).
 */
export function apiBase(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '';
  return raw.trim().replace(/\/$/, '');
}

export function apiUrl(path: string): string {
  const base = apiBase();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${normalized}` : normalized;
}
