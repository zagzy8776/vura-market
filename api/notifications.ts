import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from './_lib/db.js';
import { requireUser } from './_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    if (req.method === 'GET') {
      const rows = await sql`SELECT id, order_id, type, title, body, read_at, created_at FROM notifications WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 50`;
      return json(res, 200, { notifications: rows, unreadCount: rows.filter((row) => !row.read_at).length });
    }
    if (req.method !== 'PATCH') return json(res, 405, { error: 'Method not allowed' });
    const { notificationId } = req.body || {};
    if (typeof notificationId !== 'string') return json(res, 400, { error: 'Notification is required.' });
    const rows = await sql`UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = ${notificationId} AND user_id = ${user.id} RETURNING id, read_at`;
    if (!rows[0]) return json(res, 404, { error: 'Notification not found.' });
    return json(res, 200, { notification: rows[0] });
  } catch {
    return json(res, 500, { error: 'Notifications are temporarily unavailable.' });
  }
}
