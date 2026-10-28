/**
 * Optional Redis REST cache for PUBLIC catalogue queries only.
 * Never put sessions, buyer details, stock reservations, payment or payout state here.
 * Database remains source of truth; failures fall through to Postgres.
 */
import { createHash } from 'node:crypto';

const URL_ENV = 'UPSTASH_REDIS_REST_URL';
const TOKEN_ENV = 'UPSTASH_REDIS_REST_TOKEN';
type Reply<T> = { result?: T; error?: string };

export function publicCacheConfigured(): boolean {
  return process.env.PUBLIC_CATALOG_CACHE_ENABLED === 'true'
    && Boolean(process.env[URL_ENV] && process.env[TOKEN_ENV]);
}

export function catalogueCacheKey(filters: {
  id?: string; sellerId?: string; q?: string; state?: string; page: number;
}): string {
  const value = JSON.stringify([filters.id || '', filters.sellerId || '',
    filters.q || '', filters.state || '', filters.page]);
  return 'vura:public:marketplace:v1:' + createHash('sha256').update(value).digest('hex');
}

async function command<T>(args: (string | number)[]): Promise<T | null> {
  if (!publicCacheConfigured()) return null;
  const url = process.env[URL_ENV]!;
  const token = process.env[TOKEN_ENV]!;
  // Never expose server cache tokens to browser bundles.
  const timer = AbortSignal.timeout(650);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: timer,
    });
    if (!res.ok) return null;
    const reply = await res.json() as Reply<T>;
    return reply.error ? null : reply.result ?? null;
  } catch {
    return null;
  }
}

export async function publicCacheGet<T>(key: string): Promise<T | null> {
  const text = await command<string>(['GET', key]);
  if (!text || typeof text !== 'string') return null;
  try { return JSON.parse(text) as T; } catch { return null; }
}

export async function publicCacheSet(key: string, value: unknown, ttlSec = 20): Promise<void> {
  const ttl = Math.max(5, Math.min(60, Math.trunc(ttlSec)));
  const serialized = JSON.stringify(value);
  if (serialized.length > 192_000) return;
  await command(['SET', key, serialized, 'EX', ttl]);
}
