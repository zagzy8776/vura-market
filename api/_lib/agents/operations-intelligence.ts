import { sql } from '../db.js';
import { executeTool } from './runtime.js';
import type { AgentContext } from './types.js';

/**
 * Operations Agent — fulfillment & payment operational snapshot.
 * Recent order reads are governed: they run through the Agent Runtime's
 * orders.read tool so every tool use is policy-checked and recorded against
 * the owning agent run. The summary SQL is intentionally kept direct because no
 * governed tool provides the multi-status fulfillment aggregation it needs.
 */
export async function analyzeOperations(context: AgentContext) {
  const [summary] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE payment_status = 'unpaid')::int AS unpaid,
      COUNT(*) FILTER (WHERE payment_status = 'pending_verification')::int AS pending_verification,
      COUNT(*) FILTER (WHERE payment_status = 'paid')::int AS paid,
      COUNT(*) FILTER (WHERE status = 'awaiting_payment')::int AS awaiting_payment,
      COUNT(*) FILTER (WHERE status IN ('confirmed', 'sourcing', 'purchased'))::int AS in_progress,
      COUNT(*) FILTER (WHERE status = 'out_for_delivery')::int AS out_for_delivery,
      COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered
    FROM orders
    WHERE COALESCE(status, '') <> 'cancelled'`;

  // Governed read — runs through the registry's orders.read tool. Exact shape
  // is projected back from the tool output's retained fields.
  const ordersResult = (await executeTool(context.agentId, context.runId, 'orders.read', { limit: 15 })) as {
    orders?: Array<{
      order_number?: string;
      status?: string;
      payment_status?: string;
      delivery_city?: string;
      total_kobo?: number;
      created_at?: Date | string;
    }>;
  };
  const recent = Array.isArray(ordersResult?.orders)
    ? ordersResult.orders.map((o) => ({
        order_number: o.order_number,
        status: o.status,
        payment_status: o.payment_status,
        delivery_city: o.delivery_city,
        total_kobo: o.total_kobo,
        created_at: o.created_at,
      }))
    : [];

  const alerts: string[] = [];
  if (summary) {
    if (Number(summary.pending_verification) > 0) {
      alerts.push(`${summary.pending_verification} payment(s) need verification.`);
    }
    if (Number(summary.unpaid) > 0) {
      alerts.push(`${summary.unpaid} order(s) still unpaid.`);
    }
    if (Number(summary.out_for_delivery) > 0) {
      alerts.push(`${summary.out_for_delivery} order(s) out for delivery — confirm tracking.`);
    }
  }
  if (!alerts.length) alerts.push('No urgent operational blockers detected from current order data.');

  return {
    summary: summary || null,
    recentOrders: recent,
    alerts,
    shippingNote: 'Use courier-agnostic tracking fields; Shippo/EasyPost/local couriers are integration points, not hard-coded.',
  };
}
