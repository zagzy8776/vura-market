/**
 * API base URL helper.
 *
 * - Leave VITE_API_BASE_URL empty → same-origin `/api/...` (Vercel front + Vercel API).
 * - Set VITE_API_BASE_URL=https://vura-market.fly.dev → Vercel front talks to Fly as the API.
 */
export function apiBase(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '';
  return raw.replace(/\/$/, '');
}

/** Prefix a path like `/api/products` with the configured API base (if any). */
export function apiUrl(path: string): string {
  const base = apiBase();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${normalized}` : normalized;
}
