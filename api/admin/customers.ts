import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
    const rows = await sql`
      SELECT
        u.id, u.name, u.email, u.role, u.created_at,
        COUNT(o.id)::int AS order_count,
        COALESCE(SUM(o.total_kobo), 0)::bigint AS total_spend_kobo
      FROM users u
      LEFT JOIN orders o ON o.buyer_id = u.id
      WHERE u.role = 'customer'
      GROUP BY u.id
      ORDER BY total_spend_kobo DESC
      LIMIT 500
    `;
    return json(res, 200, { customers: rows });
  } catch {
    return json(res, 500, { error: 'Could not load customers.' });
  }
}
