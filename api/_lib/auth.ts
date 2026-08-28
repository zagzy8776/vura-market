/// <reference types="node" />
import { createHash, randomBytes } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './db.js';

const COOKIE_NAME = 'vura_session';
const SESSION_DAYS = 30;

type SessionUser = { id: string; name: string; email: string; role: 'customer' | 'admin' };

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function parseCookies(req: VercelRequest) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        return index === -1 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function setNoStore(res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
}

function isHttps(req: VercelRequest) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  if (proto === 'https') return true;
  if (proto === 'http') return false;
  return process.env.NODE_ENV === 'production';
}

function setCookie(req: VercelRequest, res: VercelResponse, value: string, maxAge: number) {
  const secure = isHttps(req) ? '; Secure' : '';
  // SameSite=Lax is correct for same-site SPA. Do not set Domain (host-only).
  const cookie = `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}; Priority=High${secure}`;
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', cookie);
  } else if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookie]);
  } else {
    res.setHeader('Set-Cookie', [String(existing), cookie]);
  }
}

function tokenFromRequest(req: VercelRequest): string | null {
  const fromCookie = parseCookies(req)[COOKIE_NAME];
  if (fromCookie && fromCookie.length > 10) return fromCookie;
  const auth = String(req.headers.authorization || '');
  if (auth.toLowerCase().startsWith('bearer ')) {
    const t = auth.slice(7).trim();
    if (t.length > 10) return t;
  }
  const headerToken = String(req.headers['x-vura-session'] || '').trim();
  if (headerToken.length > 10) return headerToken;
  return null;
}

export async function createSession(req: VercelRequest, res: VercelResponse, userId: string) {
  setNoStore(res);
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await sql`INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip_address) VALUES (${userId}, ${hashToken(token)}, ${expiresAt.toISOString()}, ${String(req.headers['user-agent'] || '').slice(0, 500)}, ${String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64)})`;
  setCookie(req, res, token, SESSION_DAYS * 24 * 60 * 60);
  return token;
}

export async function getSessionUser(req: VercelRequest): Promise<SessionUser | null> {
  const token = tokenFromRequest(req);
  if (!token) return null;
  const rows = await sql`SELECT u.id, u.name, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > now() LIMIT 1`;
  return (rows[0] as SessionUser | undefined) || null;
}

export async function requireUser(req: VercelRequest, res: VercelResponse) {
  setNoStore(res);
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Please sign in to continue.' });
    return null;
  }
  return user;
}

export async function requireAdmin(req: VercelRequest, res: VercelResponse) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required.' });
    return null;
  }
  return user;
}

export async function requireAdminPermission(req: VercelRequest, res: VercelResponse, permission: string) {
  const user = await requireAdmin(req, res);
  if (!user) return null;
  const rows = await sql`SELECT has_admin_permission(${user.id}, ${permission}) AS allowed`;
  if (!rows[0]?.allowed) {
    res.status(403).json({ error: 'You do not have permission to perform this action.' });
    return null;
  }
  return user;
}

export async function destroySession(req: VercelRequest, res: VercelResponse) {
  setNoStore(res);
  const token = tokenFromRequest(req);
  if (token) await sql`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`;
  setCookie(req, res, '', 0);
}

const CLAIM_TOKEN_TTL_HOURS = 72;

export async function issueClaimToken(userId: string) {
  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + CLAIM_TOKEN_TTL_HOURS * 60 * 60 * 1000);
  await sql`INSERT INTO account_claim_tokens (user_id, token_hash, expires_at) VALUES (${userId}, ${tokenHash}, ${expiresAt.toISOString()})`;
  return { rawToken, tokenHash, expiresAt };
}

export async function consumeClaimToken(rawToken: string) {
  if (typeof rawToken !== 'string' || rawToken.length < 16) return null;
  const tokenHash = hashToken(rawToken);
  const rows = await sql`
    UPDATE account_claim_tokens
    SET used_at = now()
    WHERE token_hash = ${tokenHash} AND used_at IS NULL AND expires_at > now()
    RETURNING user_id
  `;
  return rows[0]?.user_id || null;
}
