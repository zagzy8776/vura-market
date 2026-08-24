import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!await requireAdmin(req, res)) return;
  try {
    if (req.method === 'GET') return json(res, 200, { suppliers: await sql`SELECT id, name, location, phone, notes, reliability_score, created_at FROM suppliers ORDER BY updated_at DESC` });
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const { name, location, phone, notes } = req.body || {};
    if (typeof name !== 'string' || name.trim().length < 2) return json(res, 400, { error: 'Supplier name is required.' });
    const rows = await sql`INSERT INTO suppliers (name, location, phone, notes) VALUES (${name.trim()}, ${location || null}, ${phone || null}, ${notes || ''}) RETURNING id, name, location, phone, notes, reliability_score`;
    return json(res, 201, { supplier: rows[0] });
  } catch { return json(res, 500, { error: 'We could not save the supplier.' }); }
}
