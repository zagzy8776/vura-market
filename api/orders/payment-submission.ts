import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db.js';
import { getSessionUser } from '../_lib/auth.js';
import { simpleOrderEmail } from '../_lib/email.js';
import { notifyAdmins, notifyUser } from '../_lib/notifications.js';

/**
 * Guest-friendly payment reference submit.
 * Prefer signed-in buyer match; otherwise allow submit by orderId / orderNumber
 * for unpaid orders (bank-transfer marketplace flow).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const sessionUser = await getSessionUser(req);
    const body = req.body || {};
    const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
    const orderNumber = typeof body.orderNumber === 'string' ? body.orderNumber.trim() : '';
    const transferReference = typeof body.transferReference === 'string' ? body.transferReference.trim() : '';

    if ((!orderId && !orderNumber) || !transferReference) {
      return json(res, 400, { error: 'Order and transfer reference are required.' });
    }
    if (transferReference.length < 4 || transferReference.length > 120) {
      return json(res, 400, { error: 'Enter a valid transfer reference from your bank receipt.' });
    }

    // Load order by id or order number
    let existing;
    if (orderId && /^[0-9a-f-]{36}$/i.test(orderId)) {
      existing = await sql`
        SELECT o.id, o.order_number, o.buyer_id, o.payment_status, o.total_kobo
        FROM orders o WHERE o.id = ${orderId}::uuid LIMIT 1`;
    } else if (orderNumber) {
      existing = await sql`
        SELECT o.id, o.order_number, o.buyer_id, o.payment_status, o.total_kobo
        FROM orders o WHERE o.order_number = ${orderNumber} LIMIT 1`;
    } else {
      return json(res, 400, { error: 'Order and transfer reference are required.' });
    }

    if (!existing[0]) return json(res, 404, { error: 'Order not found.' });

    // If signed in, only allow own orders
    if (sessionUser && existing[0].buyer_id !== sessionUser.id) {
      return json(res, 403, { error: 'This order belongs to another account.' });
    }

    if (existing[0].payment_status === 'paid') {
      return json(res, 400, { error: 'This order is already paid.' });
    }

    const rows = await sql`
      UPDATE orders
      SET payment_status = 'pending_verification',
          transfer_reference = ${transferReference},
          payment_submitted_at = now(),
          updated_at = now()
      WHERE id = ${existing[0].id}
      RETURNING id, order_number, buyer_id, payment_status, total_kobo
    `;
    if (!rows[0]) return json(res, 404, { error: 'Order not found.' });

    const buyerRows = await sql`SELECT id, name, email FROM users WHERE id = ${rows[0].buyer_id} LIMIT 1`;
    const buyer = buyerRows[0];

    if (buyer) {
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
    }

    const adminEmail = simpleOrderEmail(
      `Verify payment: ${rows[0].order_number}`,
      'Vura admin',
      rows[0].order_number,
      `Customer submitted bank transfer reference: ${transferReference}. Please verify and confirm the order.`,
    );
    await notifyAdmins({
      orderId: rows[0].id,
      orderNumber: rows[0].order_number,
      eventType: 'payment.submitted.admin',
      title: `Payment needs verification: ${rows[0].order_number}`,
      body: `Transfer reference: ${transferReference}`,
      subject: adminEmail.subject,
      text: adminEmail.text,
      html: adminEmail.html,
    });

    return json(res, 200, {
      order: {
        id: rows[0].id,
        order_number: rows[0].order_number,
        payment_status: 'pending_verification',
      },
    });
  } catch (error) {
    if (error instanceof Error && /duplicate key|orders_transfer_reference_uidx/i.test(error.message)) {
      return json(res, 409, { error: 'That transfer reference has already been submitted.' });
    }
    console.error('[payment-submission]', error);
    return json(res, 500, { error: 'We could not submit the payment confirmation.' });
  }
}
