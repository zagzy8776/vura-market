import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db';
import { requireAdmin } from '../_lib/auth';
import { simpleOrderEmail } from '../_lib/email';
import { notifyUser } from '../_lib/notifications';

const allowedStatuses = new Set(['awaiting_payment', 'payment_verification', 'confirmed', 'sourcing', 'purchased', 'out_for_delivery', 'delivered', 'cancelled']);
const allowedSourcing = new Set(['awaiting_confirmation', 'confirmed', 'sourcing', 'purchased', 'out_for_delivery', 'delivered', 'cancelled']);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    if (req.method === 'GET') {
      const rows = await sql`SELECT o.id, o.order_number, o.quantity, o.total_kobo, o.status, o.payment_status, o.transfer_reference, o.payment_submitted_at, o.payment_verified_at, o.sourcing_status, o.delivery_name, o.delivery_phone, o.delivery_address, o.delivery_city, o.purchase_cost_kobo, o.delivery_fee_kobo, o.other_cost_kobo, o.actual_profit_kobo, o.created_at, p.name AS product_name, p.brand, s.name AS supplier_name, u.email AS buyer_email FROM orders o JOIN products p ON p.id = o.product_id LEFT JOIN suppliers s ON s.id = o.supplier_id JOIN users u ON u.id = o.buyer_id ORDER BY o.created_at DESC LIMIT 200`;
      return json(res, 200, { orders: rows });
    }
    if (req.method !== 'PATCH') return json(res, 405, { error: 'Method not allowed' });

    const { orderId, status, paymentStatus, sourcingStatus, supplierId, purchaseCostKobo, deliveryFeeKobo, otherCostKobo } = req.body || {};
    if (typeof orderId !== 'string') return json(res, 400, { error: 'Order is required.' });
    if (status != null && (!allowedStatuses.has(status))) return json(res, 400, { error: 'Invalid order status.' });
    if (sourcingStatus != null && (!allowedSourcing.has(sourcingStatus))) return json(res, 400, { error: 'Invalid sourcing status.' });
    if (paymentStatus != null && !['unpaid', 'pending_verification', 'paid', 'rejected'].includes(paymentStatus)) return json(res, 400, { error: 'Invalid payment status.' });

    const existing = await sql`SELECT o.id, o.order_number, o.total_kobo, o.payment_status, o.status, o.sourcing_status, u.id AS buyer_id, u.name AS buyer_name, u.email AS buyer_email, p.name AS product_name FROM orders o JOIN users u ON u.id = o.buyer_id JOIN products p ON p.id = o.product_id WHERE o.id = ${orderId} LIMIT 1`;
    if (!existing[0]) return json(res, 404, { error: 'Order not found.' });

    const purchase = purchaseCostKobo == null || purchaseCostKobo === '' ? null : Math.round(Number(purchaseCostKobo));
    const delivery = deliveryFeeKobo == null || deliveryFeeKobo === '' ? 0 : Math.round(Number(deliveryFeeKobo));
    const other = otherCostKobo == null || otherCostKobo === '' ? 0 : Math.round(Number(otherCostKobo));
    if (purchase !== null && (!Number.isFinite(purchase) || purchase < 0)) return json(res, 400, { error: 'Purchase cost is invalid.' });
    if (!Number.isFinite(delivery) || delivery < 0 || !Number.isFinite(other) || other < 0) return json(res, 400, { error: 'Order costs are invalid.' });
    const actualProfit = purchase == null ? null : Number(existing[0].total_kobo) - purchase - delivery - other;
    const nextPaymentStatus = paymentStatus || existing[0].payment_status;
    const nextStatus = status || (paymentStatus === 'paid' ? 'confirmed' : paymentStatus === 'rejected' ? 'awaiting_payment' : existing[0].status);
    const nextSourcing = sourcingStatus || existing[0].sourcing_status;

    const updated = await sql`UPDATE orders SET status = ${nextStatus}, payment_status = ${nextPaymentStatus}, sourcing_status = ${nextSourcing}, supplier_id = COALESCE(${supplierId || null}, supplier_id), purchase_cost_kobo = COALESCE(${purchase}, purchase_cost_kobo), delivery_fee_kobo = ${delivery}, other_cost_kobo = ${other}, actual_profit_kobo = COALESCE(${actualProfit}, actual_profit_kobo), purchased_at = CASE WHEN ${purchase} IS NOT NULL THEN COALESCE(purchased_at, now()) ELSE purchased_at END, paid_at = CASE WHEN ${nextPaymentStatus} = 'paid' THEN COALESCE(paid_at, now()) ELSE paid_at END, payment_verified_at = CASE WHEN ${nextPaymentStatus} IN ('paid', 'rejected') THEN now() ELSE payment_verified_at END, updated_at = now() WHERE id = ${orderId} RETURNING id, order_number, status, payment_status, sourcing_status, actual_profit_kobo`;

    const stateChanged = existing[0].payment_status !== nextPaymentStatus || existing[0].status !== nextStatus || existing[0].sourcing_status !== nextSourcing;
    if (stateChanged) {
      let message = `Your order ${updated[0].order_number} is now ${String(nextStatus).replaceAll('_', ' ')}.`;
      if (nextPaymentStatus === 'paid') message = `Your payment for order ${updated[0].order_number} has been verified. We can now proceed with sourcing.`;
      if (nextPaymentStatus === 'rejected') message = `We could not verify the payment for order ${updated[0].order_number}. Please check your transfer details and contact Vura support.`;
      const email = simpleOrderEmail(`Vura order ${updated[0].order_number} update`, existing[0].buyer_name, updated[0].order_number, message);
      await notifyUser({
        userId: existing[0].buyer_id,
        email: existing[0].buyer_email,
        firstName: existing[0].buyer_name,
        orderId: updated[0].id,
        eventType: `order.status.${nextStatus}`,
        title: nextPaymentStatus === 'paid' ? 'Payment verified' : 'Order updated',
        body: message,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
    }

    return json(res, 200, { order: updated[0] });
  } catch {
    return json(res, 500, { error: 'We could not update the order.' });
  }
}
