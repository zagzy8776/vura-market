import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db.js';
import { requireUser } from '../_lib/auth.js';
import { simpleOrderEmail } from '../_lib/email.js';
import { notifyAdmins, notifyUser } from '../_lib/notifications.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireUser(req, res);
  if (!user) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const { orderId, transferReference } = req.body || {};
    if (typeof orderId !== 'string' || typeof transferReference !== 'string' || transferReference.trim().length < 3 || transferReference.trim().length > 100) return json(res, 400, { error: 'Enter the transfer reference from your bank receipt.' });
    const rows = await sql`UPDATE orders SET payment_status = 'pending_verification', status = 'payment_verification', transfer_reference = ${transferReference.trim()}, payment_submitted_at = now(), updated_at = now() WHERE id = ${orderId} AND buyer_id = ${user.id} AND payment_status = 'unpaid' RETURNING id, order_number, total_kobo`;
    if (!rows[0]) return json(res, 409, { error: 'This order cannot accept another payment confirmation.' });
    const email = simpleOrderEmail(`Payment submitted for ${rows[0].order_number}`, user.name, rows[0].order_number, 'We received your transfer reference and will verify your payment before sourcing your product.');
    await notifyUser({ userId: user.id, email: user.email, firstName: user.name, orderId: rows[0].id, eventType: 'payment.submitted', title: 'Payment submitted', body: 'Your transfer reference has been submitted. We will verify your payment before sourcing your order.', subject: email.subject, text: email.text, html: email.html });
    const adminEmail = simpleOrderEmail(`Verify payment: ${rows[0].order_number}`, 'Vura admin', rows[0].order_number, `A customer submitted transfer reference ${transferReference.trim()}. Please verify the bank transfer and confirm the order.`);
    await notifyAdmins({ orderId: rows[0].id, eventType: 'payment.submitted.admin', title: `Payment needs verification: ${rows[0].order_number}`, body: `A customer submitted transfer reference ${transferReference.trim()}.`, subject: adminEmail.subject, text: adminEmail.text, html: adminEmail.html });
    return json(res, 200, { order: rows[0] });
  } catch (error) {
    if (error instanceof Error && /duplicate key|orders_transfer_reference_uidx/i.test(error.message)) return json(res, 409, { error: 'That transfer reference has already been submitted.' });
    return json(res, 500, { error: 'We could not submit the payment confirmation.' });
  }
}
