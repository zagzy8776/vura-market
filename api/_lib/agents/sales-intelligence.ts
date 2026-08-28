import { sql } from '../db.js';
import type { AgentContext } from './types.js';

/** Sales Agent — DB-only insights. No customer messaging. */
export async function analyzeSales(_context: AgentContext) {
  const top = await sql`
    SELECT p.name, p.brand, COUNT(o.id)::int AS orders,
           COALESCE(SUM(o.total_kobo), 0)::bigint AS volume_kobo
    FROM orders o JOIN products p ON p.id = o.product_id
    WHERE COALESCE(o.status, '') <> 'cancelled'
    GROUP BY p.id, p.name, p.brand
    ORDER BY orders DESC LIMIT 10`;

  const slow = await sql`
    SELECT p.id, p.name, p.brand, p.stock_status, p.price_kobo
    FROM products p
    WHERE p.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM orders o WHERE o.product_id = p.id AND o.created_at > now() - interval '30 days'
      )
    ORDER BY p.updated_at DESC NULLS LAST
    LIMIT 10`;

  const payments = await sql`
    SELECT COALESCE(payment_status, 'unknown') AS payment_status, COUNT(*)::int AS count
    FROM orders GROUP BY 1 ORDER BY count DESC`;

  const stock = await sql`
    SELECT COALESCE(stock_status, 'unknown') AS stock_status, COUNT(*)::int AS count
    FROM products WHERE is_active = true GROUP BY 1`;

  const insights: string[] = [];
  if (top[0]) {
    insights.push(
      `Top seller: ${top[0].brand ? top[0].brand + ' ' : ''}${top[0].name} (${top[0].orders} orders).`,
    );
  }
  if (slow.length) {
    insights.push(`${slow.length} active products had no orders in the last 30 days — review promotion or pricing.`);
  }
  const unpaid = payments.find((p) => p.payment_status === 'unpaid' || p.payment_status === 'pending_verification');
  if (unpaid && Number(unpaid.count) > 0) {
    insights.push(`${unpaid.count} orders still ${unpaid.payment_status} — follow up via admin, not auto-messages.`);
  }
  const low = stock.find((s) => s.stock_status === 'low_stock' || s.stock_status === 'out_of_stock');
  if (low) insights.push(`Inventory attention: ${low.count} products marked ${low.stock_status}.`);

  if (!insights.length) insights.push('Not enough order history yet for strong sales signals.');

  const unpaidOrders = await sql`
    SELECT order_number, delivery_name, delivery_phone, total_kobo, payment_status, created_at
    FROM orders
    WHERE payment_status IN ('unpaid', 'pending_verification')
    ORDER BY created_at DESC LIMIT 15`;

  const followUpQueue = unpaidOrders.map((o) => ({
    customer: o.delivery_name || 'Customer',
    orderNumber: o.order_number,
    reason: o.payment_status === 'pending_verification' ? 'Verify payment' : 'Payment outstanding',
    priority: o.payment_status === 'pending_verification' ? 'high' : 'medium',
    suggestedMessage: `Hi, regarding order ${o.order_number} — please complete or confirm payment when convenient.`,
    status: 'pending_human',
    phone: o.delivery_phone || null,
  }));

  return {
    insights,
    topProducts: top,
    slowProducts: slow,
    payments,
    stock,
    followUpQueue,
    promotionRecommendations: top.slice(0, 3).map((p) => `Consider promoting: ${p.brand ? p.brand + ' ' : ''}${p.name}`),
    messageQueuePolicy: 'Human-only: agents must not auto-message customers.',
  };
}
