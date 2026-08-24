import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hash } from 'bcryptjs';
import { sql, json } from '../_lib/db';
import { createSession } from '../_lib/auth';
import { sendTransactionalEmail } from '../_lib/email';
import { createNotification } from '../_lib/notifications';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const { name, email, password } = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 2 || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email.trim()) || typeof password !== 'string' || password.length < 8) return json(res, 400, { error: 'Use a valid email and a password of at least 8 characters.' });
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
      html: `<!doctype html><html><body style="margin:0;background:#f7f7fb;font-family:Arial,Helvetica,sans-serif;color:#151527"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:32px 16px"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:24px"><tr><td style="padding:32px"><p style="margin:0;font-size:28px;line-height:34px;font-weight:700;color:#5b2cff">vura.</p><p style="margin:24px 0 8px;font-size:16px;line-height:24px">Hi ${rows[0].name.replace(/[&<>\"]/g, '')},</p><p style="margin:0;font-size:16px;line-height:26px">Welcome to Vura. Your account is ready. We find products from local stores, give you one clear price, and handle the order and delivery.</p></td></tr></table></td></tr></table></body></html>`,
    });
    return json(res, 201, { user: rows[0] });
  } catch (error) {
    const message = error instanceof Error && /unique/i.test(error.message) ? 'An account with that email already exists.' : 'We could not create that account.';
    return json(res, 400, { error: message });
  }
}
