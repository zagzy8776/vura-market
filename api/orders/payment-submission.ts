import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db.js';
import { requireUser } from '../_lib/auth.js';
import { simpleOrderEmail } from '../_lib/email.js';
import { notifyAdmins, notifyUser } from '../_lib/notifications.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const user = await requireUser(req, res);
  if (!user) return;

  try {
    const { orderId, transferReference } = req.body || {};
    if (typeof orderId !== 'string' || typeof transferReference !== 'string') {
      return json(res, 400, { error: 'Order and transfer reference are required.' });
    }
    const ref = transferReference.trim();
    if (ref.length < 4 || ref.length > 120) {
      return json(res, 400, { error: 'Enter a valid transfer reference.' });
    }

    const existing = await sql`
      SELECT o.id, o.order_number, o.buyer_id, o.payment_status, o.total_kobo
      FROM orders o WHERE o.id = ${orderId} AND o.buyer_id = ${user.id} LIMIT 1
    `;
    if (!existing[0]) return json(res, 404, { error: 'Order not found.' });
    if (existing[0].payment_status === 'paid') {
      return json(res, 400, { error: 'This order is already paid.' });
    }

    const rows = await sql`
      UPDATE orders
      SET payment_status = 'pending_verification',
          transfer_reference = ${ref},
          payment_submitted_at = now(),
          updated_at = now()
      WHERE id = ${orderId} AND buyer_id = ${user.id}
      RETURNING id, order_number, buyer_id, payment_status, total_kobo
    `;
    if (!rows[0]) return json(res, 404, { error: 'Order not found.' });

    const buyerRows = await sql`SELECT id, name, email FROM users WHERE id = ${rows[0].buyer_id} LIMIT 1`;
    const buyer = buyerRows[0] || user;

    const email = simpleOrderEmail(
      `Payment submitted for ${rows[0].order_number}`,
      buyer.name,
      rows[0].order_number,
      'We received your transfer reference and will verify your payment before sourcing your product.',
    );
    await notifyUser({
      userId: rows[0].buyer_id,
      email: buyer.email,
      firstName: buyer.name,
      orderId: rows[0].id,
      orderNumber: rows[0].order_number,
      eventType: 'payment.submitted',
      title: 'Payment submitted',
      body: 'Your transfer reference has been submitted. We will verify your payment before sourcing your order.',
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
    const adminEmail = simpleOrderEmail(
      `Verify payment: ${rows[0].order_number}`,
      'Vura admin',
      rows[0].order_number,
      `A customer submitted a transfer reference. Please verify the bank transfer and confirm the order.`,
    );
    await notifyAdmins({
      orderId: rows[0].id,
      orderNumber: rows[0].order_number,
      eventType: 'payment.submitted.admin',
      title: `Payment needs verification: ${rows[0].order_number}`,
      body: 'A customer submitted a transfer reference for verification.',
      subject: adminEmail.subject,
      text: adminEmail.text,
      html: adminEmail.html,
    });
    return json(res, 200, { order: { id: rows[0].id, order_number: rows[0].order_number, payment_status: 'pending_verification' } });
  } catch (error) {
    if (error instanceof Error && /duplicate key|orders_transfer_reference_uidx/i.test(error.message)) {
      return json(res, 409, { error: 'That transfer reference has already been submitted.' });
    }
    return json(res, 500, { error: 'We could not submit the payment confirmation.' });
  }
}
