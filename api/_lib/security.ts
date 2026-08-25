import { createHash } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './db.js';

export function applySecurityHeaders(res: VercelResponse) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:; font-src 'self' data: https:; script-src 'self' 'unsafe-inline' https:; connect-src 'self' https:; form-action 'self'");
}

export async function enforceRateLimit(req: VercelRequest, res: VercelResponse, bucket: string, limit = 60, windowSeconds = 60) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const identity = forwarded || req.socket?.remoteAddress || 'unknown';
  const subjectHash = createHash('sha256').update(identity).digest('hex');
  const rows = await sql`SELECT consume_api_rate_limit(${bucket}, ${subjectHash}, ${limit}, ${windowSeconds}) AS allowed`;
  if (!rows[0]?.allowed) {
    res.setHeader('Retry-After', String(windowSeconds));
    res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
    return false;
  }
  return true;
}
