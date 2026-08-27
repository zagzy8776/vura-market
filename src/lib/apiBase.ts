/**
 * API base URL helper.
 *
 * Architecture:
 *   Vercel = public frontend (customers)
 *   Fly    = API host (gateway today; native handlers later)
 *
 * Resolution order:
 *   1. VITE_API_BASE_URL if set at build time
 *   2. Production builds default to Fly so the shop scales off Vercel serverless limits
 *   3. Dev / empty → same-origin `/api/...`
 */
export function apiBase(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '';
  if (raw.trim()) return raw.replace(/\/$/, '');
  // Production (Vercel build): send browser API traffic to Fly
  if (import.meta.env.PROD) return 'https://vura-market.fly.dev';
  return '';
}

/** Prefix a path like `/api/products` with the configured API base (if any). */
export function apiUrl(path: string): string {
  const base = apiBase();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${normalized}` : normalized;
}
