import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hash } from 'bcryptjs';
import { sql, json } from '../_lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const { name, email, password } = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 2 || typeof email !== 'string' || typeof password !== 'string' || password.length < 6) return json(res, 400, { error: 'Please check your details.' });
  try {
    const passwordHash = await hash(password, 12);
    const rows = await sql`INSERT INTO users (name, email, password_hash) VALUES (${name.trim()}, ${email.toLowerCase().trim()}, ${passwordHash}) RETURNING id, name, email`;
    return json(res, 201, { user: rows[0] });
  } catch {
    return json(res, 400, { error: 'We could not create that account.' });
  }
}
