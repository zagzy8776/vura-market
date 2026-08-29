/**
 * API base URL helper.
 *
 * Customer storefronts use same-origin `/api/...` so production custom
 * domains stay on the Vercel API and browser sessions remain first-party.
 *
 * `VITE_API_BASE_URL` is still supported for intentional cross-origin/admin
 * or development deployments, but the public Vura domains always stay
 * same-origin. This prevents a stale Fly URL from being baked into a
 * production customer bundle and causing browser CORS failures.
 */
export function apiBase(): string {
  const host = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';

  // The public storefront domains must call their own `/api` routes.
  // Do not let a deployment-level VITE_API_BASE_URL send customer traffic
  // to Fly, where the browser would become cross-origin and cookies/CORS
  // can fail even though direct navigation to /api works.
  if (host === 'vuramarket.com.ng' || host === 'www.vuramarket.com.ng') {
    return '';
  }

  const raw = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '';
  return raw.trim().replace(/\/$/, '');
}

export function apiUrl(path: string): string {
  const base = apiBase();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${normalized}` : normalized;
}
