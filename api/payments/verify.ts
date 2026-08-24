import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db';
import { requireUser } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const user = await requireUser(req, res);
  if (!user) return;
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const reference = typeof req.body?.reference === 'string' ? req.body.reference : '';
  if (!secret || !reference) return json(res, 400, { error: 'Payment reference is required.' });
  try {
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${secret}` } });
    const result = await response.json() as { status?: boolean; data?: { status?: string; amount?: number; reference?: string } };
    if (!response.ok || !result.status || !result.data) return json(res, 502, { error: 'We could not verify the payment.' });
    const paid = result.data.status === 'success';
    const rows = await sql`SELECT id, total_kobo FROM orders WHERE payment_reference = ${reference} AND buyer_id = ${user.id} LIMIT 1`;
    if (!rows[0]) return json(res, 404, { error: 'Order not found.' });
    if (paid && Number(result.data.amount) === Number(rows[0].total_kobo)) {
      await sql`UPDATE orders SET payment_status = 'paid', status = 'paid', paid_at = COALESCE(paid_at, now()), updated_at = now() WHERE id = ${rows[0].id}`;
      return json(res, 200, { paid: true, orderId: rows[0].id });
    }
    return json(res, 200, { paid: false, status: result.data.status || 'unknown', orderId: rows[0].id });
  } catch {
    return json(res, 500, { error: 'We could not verify the payment.' });
  }
}
