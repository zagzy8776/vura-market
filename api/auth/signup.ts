import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hash } from 'bcryptjs';
import { sql, json } from '../_lib/db';
import { createSession } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const { name, email, password } = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 2 || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email.trim()) || typeof password !== 'string' || password.length < 8) return json(res, 400, { error: 'Use a valid email and a password of at least 8 characters.' });
  try {
    const passwordHash = await hash(password, 12);
    const rows = await sql`INSERT INTO users (name, email, password_hash, role) VALUES (${name.trim()}, ${email.toLowerCase().trim()}, ${passwordHash}, 'customer') RETURNING id, name, email, role`;
    await createSession(req, res, rows[0].id);
    return json(res, 201, { user: rows[0] });
  } catch (error) {
    const message = error instanceof Error && /unique/i.test(error.message) ? 'An account with that email already exists.' : 'We could not create that account.';
    return json(res, 400, { error: message });
  }
}
