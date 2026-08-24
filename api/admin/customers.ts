import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  if (!await requireAdmin(req, res)) return;
  try {
    const rows = await sql`
      SELECT u.id, u.name, u.email, u.role, u.created_at,
             COUNT(o.id)::int AS order_count,
             COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.total_kobo ELSE 0 END), 0)::bigint AS total_spend_kobo
      FROM users u
      LEFT JOIN orders o ON o.buyer_id = u.id
      WHERE u.role = 'customer'
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT 1000
    `;
    return json(res, 200, { customers: rows });
  } catch {
    return json(res, 500, { error: 'We could not load customers.' });
  }
}
