const KEY = 'vura_session_token';

export function getSessionToken(): string | null {
  try {
    return sessionStorage.getItem(KEY) || localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string | null | undefined) {
  try {
    if (!token) {
      sessionStorage.removeItem(KEY);
      localStorage.removeItem(KEY);
      return;
    }
    sessionStorage.setItem(KEY, token);
    localStorage.setItem(KEY, token);
  } catch {
    /* private mode */
  }
}

/** Headers for authenticated same-origin API calls (cookie + Bearer fallback). */
export function authHeaders(extra?: HeadersInit): HeadersInit {
  const token = getSessionToken();
  const base: Record<string, string> = {};
  if (token) {
    base.Authorization = `Bearer ${token}`;
    base['X-Vura-Session'] = token;
  }
  if (!extra) return base;
  if (extra instanceof Headers) {
    const h = new Headers(extra);
    Object.entries(base).forEach(([k, v]) => h.set(k, v));
    return h;
  }
  return { ...base, ...(extra as Record<string, string>) };
}
