import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db.js';
import { createSession, getSessionUser, issueClaimToken } from '../_lib/auth.js';
import { orderEmail, simpleOrderEmail } from '../_lib/email.js';
import { notifyAdmins, notifyUser } from '../_lib/notifications.js';

function originFromRequest(req: VercelRequest) {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost';
  return `${proto}://${host}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const sessionUser = await getSessionUser(req);
      if (!sessionUser) return json(res, 401, { error: 'Sign in required.' });
      const rows = await sql`SELECT o.id, o.order_number, o.quantity, o.total_kobo, o.status, o.payment_method, o.payment_status, o.transfer_reference, o.payment_submitted_at, o.payment_verified_at, o.sourcing_status, o.delivery_name, o.delivery_phone, o.delivery_address, o.delivery_city, o.created_at, p.name AS product_name, p.brand, ARRAY_AGG(pi.image_url ORDER BY pi.sort_order) FILTER (WHERE pi.image_url IS NOT NULL) AS images FROM orders o JOIN products p ON p.id = o.product_id LEFT JOIN product_images pi ON pi.product_id = p.id WHERE o.buyer_id = ${sessionUser.id} GROUP BY o.id, p.name, p.brand ORDER BY o.created_at DESC LIMIT 100`;
      return json(res, 200, { orders: rows });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    // ... body continues from original file - need full file
  } catch {
    return json(res, 500, { error: 'We could not process that request.' });
  }
}
