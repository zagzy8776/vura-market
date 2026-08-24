import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') return json(res, 200, { categories: await sql`SELECT id, name, slug, icon FROM categories ORDER BY name` });
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    if (!await requireAdmin(req, res)) return;
    const { name, icon = 'Package' } = req.body || {};
    if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 60) return json(res, 400, { error: 'Category name is required.' });
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const rows = await sql`INSERT INTO categories (name, slug, icon) VALUES (${name.trim()}, ${slug}, ${String(icon).slice(0, 40)}) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, icon = EXCLUDED.icon RETURNING id, name, slug, icon`;
    return json(res, 201, { category: rows[0] });
  } catch {
    return json(res, 500, { error: 'We could not update categories.' });
  }
}
