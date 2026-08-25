import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db.js';
import { requireUser } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  const user = await requireUser(req, res);
  if (!user) return;

  const orderId = Array.isArray(req.query.orderId) ? req.query.orderId[0] : req.query.orderId;
  if (typeof orderId !== 'string' || !orderId) return json(res, 400, { error: 'Order is required.' });

  const order = await sql`
    SELECT id, order_number, status, sourcing_status, payment_status,
           delivery_name, delivery_phone, delivery_address, delivery_city,
           created_at, updated_at
      FROM orders
     WHERE id = ${orderId} AND buyer_id = ${user.id}
     LIMIT 1
  `;
  if (!order[0]) return json(res, 404, { error: 'Order not found.' });

  const events = await sql`
    SELECT id, status, message, location, tracking_number, source, created_at
      FROM order_tracking_events
     WHERE order_id = ${orderId}
     ORDER BY created_at ASC
  `;

  return json(res, 200, { order: order[0], events });
}
