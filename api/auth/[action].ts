import type { VercelRequest, VercelResponse } from '@vercel/node';
import { compare, hash } from 'bcryptjs';
import { sql, json } from '../_lib/db.js';
import { createSession, destroySession, getSessionUser, consumeClaimToken } from '../_lib/auth.js';
import { sendTransactionalEmail } from '../_lib/email.js';
import { createNotification } from '../_lib/notifications.js';

function actionFrom(req: VercelRequest) {
  const value = req.query.action;
  return Array.isArray(value) ? value[0] : value;
}

function adminEnv() {
  return {
    email: (process.env.ADMIN_EMAIL || '').toLowerCase().trim(),
    password: process.env.ADMIN_PASSWORD || '',
    name: (process.env.ADMIN_NAME || 'Vura Admin').trim(),
  };
}

async function provisionOwner(email: string, password: string) {
  const admin = adminEnv();
  if (!admin.email || !admin.password) return null;
  if (email.toLowerCase().trim() !== admin.email) return null;
  if (password !== admin.password) return null;

  const existing = await sql`SELECT id FROM users WHERE email = ${admin.email} LIMIT 1`;
  const passwordHash = await hash(admin.password, 12);

  if (existing[0]) {
    const rows = await sql`
      UPDATE users
      SET role = 'admin', password_hash = ${passwordHash},
          name = COALESCE(NULLIF(${admin.name}, ''), name), updated_at = now()
      WHERE id = ${existing[0].id}
      RETURNING id, name, email, role
    `;
    return rows[0];
  }

  const rows = await sql`
    INSERT INTO users (name, email, password_hash, role)
    VALUES (${admin.name}, ${admin.email}, ${passwordHash}, 'admin')
    RETURNING id, name, email, role
  `;
  return rows[0];
}

async function promoteIfOwner(userId: string, email: string) {
  const admin = adminEnv();
  if (!admin.email || email.toLowerCase().trim() !== admin.email) return null;
  const rows = await sql`
    UPDATE users SET role = 'admin', updated_at = now()
    WHERE id = ${userId}
    RETURNING id, name, email, role
  `;
  return rows[0] || null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = actionFrom(req);

  if (action === 'login') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || email.trim().length < 3 || password.length < 1) {
      return json(res, 400, { error: 'Please check your details.' });
    }
    try {
      const owner = await provisionOwner(email, password);
      if (owner) {
        await createSession(req, res, owner.id);
        return json(res, 200, { user: { id: owner.id, name: owner.name, email: owner.email, role: owner.role } });
      }

      const rows = await sql`SELECT id, name, email, password_hash, role FROM users WHERE email = ${email.toLowerCase().trim()} LIMIT 1`;
      if (!rows[0]) return json(res, 401, { error: 'Those details do not match an account.' });

      const valid = await compare(password, rows[0].password_hash);
      if (!valid) return json(res, 401, { error: 'Those details do not match an account.' });

      const promoted = await promoteIfOwner(rows[0].id, rows[0].email);
      const user = promoted || { id: rows[0].id, name: rows[0].name, email: rows[0].email, role: rows[0].role };
      await createSession(req, res, user.id);
      return json(res, 200, { user: { id: user.id, name: user.name, email: user.email, role: user.role } });
    } catch {
      return json(res, 500, { error: 'We could not sign you in.' });
    }
  }

  if (action === 'signup') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const { name, email, password } = req.body || {};
    if (typeof name !== 'string' || name.trim().length < 2 || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email.trim()) || typeof password !== 'string' || password.length < 8) {
      return json(res, 400, { error: 'Use a valid email and a password of at least 8 characters.' });
    }
    try {
      const passwordHash = await hash(password, 12);
      const rows = await sql`INSERT INTO users (name, email, password_hash, role) VALUES (${name.trim()}, ${email.toLowerCase().trim()}, ${passwordHash}, 'customer') RETURNING id, name, email, role`;
      await createSession(req, res, rows[0].id);
      await createNotification(rows[0].id, 'account.created', 'Welcome to Vura', 'Your Vura account is ready. Start exploring curated products.', null);
      await sendTransactionalEmail({
        userId: rows[0].id,
        eventType: 'account.created',
        recipient: rows[0].email,
        subject: 'Welcome to Vura',
        text: `Hi ${rows[0].name}, welcome to Vura. Your account is ready and you can start exploring curated products.`,
        html: `<!doctype html><html><body style="margin:0;background:#f7f7fb;font-family:Arial,Helvetica,sans-serif;color:#151527"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:32px 16px"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:24px"><tr><td style="padding:32px"><p style="margin:0;font-size:28px;line-height:34px;font-weight:700;color:#5b2cff">vura.</p><p style="margin:24px 0 8px;font-size:16px;line-height:24px">Hi ${rows[0].name.replace(/[&<>"]/g, '')},</p><p style="margin:0;font-size:16px;line-height:26px">Welcome to Vura. Your account is ready.</p></td></tr></table></td></tr></table></body></html>`,
      });
      return json(res, 201, { user: rows[0] });
    } catch (error) {
      const message = error instanceof Error && /unique/i.test(error.message) ? 'An account with that email already exists.' : 'We could not create that account.';
      return json(res, 400, { error: message });
    }
  }

  if (action === 'logout') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    try {
      await destroySession(req, res);
      return json(res, 200, { ok: true });
    } catch {
      return json(res, 500, { error: 'We could not sign you out.' });
    }
  }

  if (action === 'me') {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    try {
      const user = await getSessionUser(req);
      return json(res, 200, { user });
    } catch {
      return json(res, 500, { error: 'We could not load your session.' });
    }
  }

  if (action === 'claim') {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const { token, password } = req.body || {};
    if (typeof token !== 'string' || token.length < 16 || typeof password !== 'string' || password.length < 8) {
      return json(res, 400, { error: 'Open the link from your email and choose a password of at least 8 characters.' });
    }
    try {
      const userId = await consumeClaimToken(token);
      if (!userId) return json(res, 400, { error: 'This claim link has expired or already been used.' });
      const passwordHash = await hash(password, 12);
      const rows = await sql`UPDATE users SET password_hash = ${passwordHash}, updated_at = now() WHERE id = ${userId} RETURNING id, name, email, role`;
      if (!rows[0]) return json(res, 404, { error: 'Account not found.' });
      await createSession(req, res, rows[0].id);
      return json(res, 200, { user: rows[0] });
    } catch {
      return json(res, 500, { error: 'We could not claim that account right now.' });
    }
  }

  return json(res, 404, { error: 'Not found' });
}
