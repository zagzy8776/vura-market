import { sql } from '../db.js';
import type { AgentContext } from './types.js';

/** Operations Agent — fulfillment & payment operational snapshot. */
export async function analyzeOperations(_context: AgentContext) {
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

  const recent = await sql`
    SELECT order_number, status, payment_status, delivery_city, total_kobo, created_at
    FROM orders ORDER BY created_at DESC LIMIT 15`;

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
