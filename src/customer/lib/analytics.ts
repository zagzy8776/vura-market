const SESSION_KEY = 'vura_session_id';
const RECENT_SEARCHES_KEY = 'vura_recent_searches';
const RECENT_PRODUCTS_KEY = 'vura_recent_products';

export function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36));
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return 'anonymous';
  }
}

type TrackedEvent = { type: string; path?: string; sessionId: string; payload?: Record<string, unknown> };

const queue: TrackedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  if (!queue.length) return;
  const events = queue.splice(0, queue.length);
  try {
    void fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // analytics must never break the storefront
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, 1500);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
}

export function track(type: string, payload?: Record<string, unknown>) {
  const event: TrackedEvent = { type, sessionId: getSessionId(), path: window.location.pathname + window.location.search, payload };
  queue.push(event);
  scheduleFlush();
}

export function trackSearch(query: string) {
  track('search', { query });
}

export function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function rememberSearch(query: string) {
  const q = query.trim();
  if (!q) return;
  const next = [q, ...getRecentSearches().filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, 8);
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable
  }
}

export function getRecentProductIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_PRODUCTS_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, 12) : [];
  } catch {
    return [];
  }
}

export function rememberProduct(id: string) {
  const next = [id, ...getRecentProductIds().filter((x) => x !== id)].slice(0, 12);
  try {
    localStorage.setItem(RECENT_PRODUCTS_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable
  }
}
