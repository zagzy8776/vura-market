import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  if (!await requireAdmin(req, res)) return;
  try {
    const rows = await sql`
      SELECT n.id, n.user_id, n.order_id, n.type, n.title, n.body, n.created_at,
             u.email AS user_email, o.order_number
      FROM notifications n
      JOIN users u ON u.id = n.user_id
      LEFT JOIN orders o ON o.id = n.order_id
      ORDER BY n.created_at DESC
      LIMIT 300
    `;
    return json(res, 200, { notifications: rows });
  } catch {
    return json(res, 500, { error: 'We could not load notifications.' });
  }
}
