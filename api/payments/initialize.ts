import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db';
import { requireUser } from '../_lib/auth';

const PAYSTACK_URL = 'https://api.paystack.co/transaction/initialize';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const user = await requireUser(req, res);
  if (!user) return;
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return json(res, 503, { error: 'Payments are not configured yet.' });
  const { orderId } = req.body || {};
  if (typeof orderId !== 'string') return json(res, 400, { error: 'Order is required.' });
  try {
    const rows = await sql`SELECT o.id, o.total_kobo, o.payment_status, u.email FROM orders o JOIN users u ON u.id = o.buyer_id WHERE o.id = ${orderId} AND o.buyer_id = ${user.id} LIMIT 1`;
    const order = rows[0];
    if (!order) return json(res, 404, { error: 'Order not found.' });
    if (order.payment_status === 'paid') return json(res, 409, { error: 'This order is already paid.' });
    const reference = `VURA-${order.id}`;
    const baseUrl = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
    const response = await fetch(PAYSTACK_URL, { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: String(order.total_kobo), email: order.email, currency: 'NGN', reference, callback_url: baseUrl ? `${baseUrl}/?payment=complete&reference=${encodeURIComponent(reference)}` : undefined, metadata: { order_id: order.id } }) });
    const result = await response.json() as { status?: boolean; message?: string; data?: { authorization_url?: string; reference?: string } };
    if (!response.ok || !result.status || !result.data?.authorization_url) return json(res, 502, { error: result.message || 'Payment could not be initialized.' });
    await sql`UPDATE orders SET payment_reference = ${result.data.reference || reference}, payment_status = 'pending', updated_at = now() WHERE id = ${order.id}`;
    return json(res, 200, { authorizationUrl: result.data.authorization_url, reference: result.data.reference || reference });
  } catch {
    return json(res, 500, { error: 'We could not start payment.' });
  }
}
