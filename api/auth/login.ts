import type { VercelRequest, VercelResponse } from '@vercel/node';
import { compare } from 'bcryptjs';
import { sql, json } from '../_lib/db';
import { createSession } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || email.trim().length < 3 || password.length < 1) return json(res, 400, { error: 'Please check your details.' });
  try {
    const rows = await sql`SELECT id, name, email, password_hash, role FROM users WHERE email = ${email.toLowerCase().trim()} LIMIT 1`;
    const valid = rows[0] ? await compare(password, rows[0].password_hash) : false;
    if (!valid) return json(res, 401, { error: 'Those details do not match an account.' });
    await createSession(req, res, rows[0].id);
    return json(res, 200, { user: { id: rows[0].id, name: rows[0].name, email: rows[0].email, role: rows[0].role } });
  } catch {
    return json(res, 500, { error: 'We could not sign you in.' });
  }
}
