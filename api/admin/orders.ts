import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db';
import { requireAdmin } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    if (req.method === 'GET') {
      const rows = await sql`SELECT o.id, o.quantity, o.total_kobo, o.status, o.payment_status, o.sourcing_status, o.delivery_name, o.delivery_phone, o.delivery_address, o.delivery_city, o.purchase_cost_kobo, o.delivery_fee_kobo, o.other_cost_kobo, o.actual_profit_kobo, o.created_at, p.name AS product_name, p.brand, s.name AS supplier_name FROM orders o JOIN products p ON p.id = o.product_id LEFT JOIN suppliers s ON s.id = o.supplier_id ORDER BY o.created_at DESC LIMIT 200`;
      return json(res, 200, { orders: rows });
    }
    if (req.method !== 'PATCH') return json(res, 405, { error: 'Method not allowed' });
    const { orderId, status, sourcingStatus, supplierId, purchaseCostKobo, deliveryFeeKobo, otherCostKobo } = req.body || {};
    if (typeof orderId !== 'string') return json(res, 400, { error: 'Order is required.' });
    const rows = await sql`SELECT id, total_kobo, payment_status FROM orders WHERE id = ${orderId} LIMIT 1`;
    if (!rows[0]) return json(res, 404, { error: 'Order not found.' });
    const purchase = purchaseCostKobo == null || purchaseCostKobo === '' ? null : Math.round(Number(purchaseCostKobo));
    const delivery = deliveryFeeKobo == null || deliveryFeeKobo === '' ? 0 : Math.round(Number(deliveryFeeKobo));
    const other = otherCostKobo == null || otherCostKobo === '' ? 0 : Math.round(Number(otherCostKobo));
    const actualProfit = purchase == null ? null : Number(rows[0].total_kobo) - purchase - delivery - other;
    const updated = await sql`UPDATE orders SET status = COALESCE(${typeof status === 'string' ? status : null}, status), sourcing_status = COALESCE(${typeof sourcingStatus === 'string' ? sourcingStatus : null}, sourcing_status), supplier_id = COALESCE(${supplierId || null}, supplier_id), purchase_cost_kobo = COALESCE(${purchase}, purchase_cost_kobo), delivery_fee_kobo = ${delivery}, other_cost_kobo = ${other}, actual_profit_kobo = ${actualProfit}, purchased_at = CASE WHEN ${purchase} IS NOT NULL THEN COALESCE(purchased_at, now()) ELSE purchased_at END, updated_at = now() WHERE id = ${orderId} RETURNING id, status, sourcing_status, actual_profit_kobo`;
    return json(res, 200, { order: updated[0] });
  } catch { return json(res, 500, { error: 'We could not update the order.' }); }
}
