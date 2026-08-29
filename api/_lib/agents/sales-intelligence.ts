import { sql } from '../db.js';
import { executeTool } from './runtime.js';
import type { AgentContext } from './types.js';

/**
 * Sales Agent — DB-only insights. No customer messaging.
 * Data access is governed: top products, payment mix, and inventory stock
 * snapshots go through the governed Agent Runtime's executeTool() so every
 * tool use is policy-checked and recorded against the owning agent run.
 * Two read gaps (slow products, unpaid-order follow-up) intentionally remain
 * direct SQL because no existing governed tool provides equivalent semantics.
 */
export async function analyzeSales(context: AgentContext) {
  // Governed reads — analytics.read (top products + payment mix) and
  // inventory.read (stock snapshot) replace the former direct SQL queries.
  const analytics = (await executeTool(context.agentId, context.runId, 'analytics.read', {})) as {
    topProducts?: Array<{ name?: string; brand?: string; orders?: number; volume_kobo?: number }>;
    payments?: Array<{ payment_status?: string; count?: number }>;
  };
  const top = Array.isArray(analytics?.topProducts) ? analytics.topProducts : [];

  const inv = (await executeTool(context.agentId, context.runId, 'inventory.read', {})) as {
    byStatus?: Array<{ stock_status?: string; count?: number }>;
  };
  const stock = Array.isArray(inv?.byStatus) ? inv.byStatus : [];
  const payments = Array.isArray(analytics?.payments) ? analytics.payments : [];

  // Intentional gap #1 — no governed tool computes "active products with no
  // orders in the last 30 days". Kept direct.
  const slow = await sql`
    SELECT p.id, p.name, p.brand, p.stock_status, p.price_kobo
    FROM products p
    WHERE p.is_active = true
      AND NOT EXISTS (
        SELECT 1 FROM orders o WHERE o.product_id = p.id AND o.created_at > now() - interval '30 days'
      )
    ORDER BY p.updated_at DESC NULLS LAST
    LIMIT 10`;

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

  // Intentional gap #2 — no governed tool returns customer contact fields
  // (delivery_name/delivery_phone) with an IN('unpaid','pending_verification')
  // filter. Kept direct.
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
