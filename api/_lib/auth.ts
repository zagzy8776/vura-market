import { createHash, randomBytes } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './db';

const COOKIE_NAME = 'vura_session';
const SESSION_DAYS = 30;

type SessionUser = { id: string; name: string; email: string; role: 'customer' | 'admin' };

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function parseCookies(req: VercelRequest) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf('=');
    return index === -1 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

function setNoStore(res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
}

function setCookie(res: VercelResponse, value: string, maxAge: number) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Priority=High${secure}`);
}

export async function createSession(req: VercelRequest, res: VercelResponse, userId: string) {
  setNoStore(res);
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await sql`INSERT INTO sessions (user_id, token_hash, expires_at, user_agent, ip_address) VALUES (${userId}, ${hashToken(token)}, ${expiresAt.toISOString()}, ${String(req.headers['user-agent'] || '').slice(0, 500)}, ${String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64)})`;
  setCookie(res, token, SESSION_DAYS * 24 * 60 * 60);
}

export async function getSessionUser(req: VercelRequest): Promise<SessionUser | null> {
  const token = parseCookies(req)[COOKIE_NAME];
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
    res.status(403).json({ error: 'This area is restricted.' });
    return null;
  }
  return user;
}

export async function destroySession(req: VercelRequest, res: VercelResponse) {
  setNoStore(res);
  const token = parseCookies(req)[COOKIE_NAME];
  if (token) await sql`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`;
  setCookie(res, '', 0);
}
