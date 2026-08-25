import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from './_lib/db.js';
import { requireAdmin } from './_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  try {
    const [summary, monthly, payments, sourcing] = await Promise.all([
      sql`SELECT COUNT(*) FILTER (WHERE payment_status='paid')::int AS paid_orders, COUNT(*) FILTER (WHERE payment_status='pending_verification')::int AS pending_orders, COUNT(*) FILTER (WHERE payment_status='rejected')::int AS rejected_orders, COALESCE(SUM(total_kobo) FILTER (WHERE payment_status='paid'),0)::bigint AS revenue_kobo, COALESCE(SUM(purchase_cost_kobo) FILTER (WHERE payment_status='paid'),0)::bigint AS purchase_cost_kobo, COALESCE(SUM(delivery_fee_kobo) FILTER (WHERE payment_status='paid'),0)::bigint AS delivery_cost_kobo, COALESCE(SUM(other_cost_kobo) FILTER (WHERE payment_status='paid'),0)::bigint AS other_cost_kobo, COALESCE(SUM(actual_profit_kobo) FILTER (WHERE payment_status='paid'),0)::bigint AS profit_kobo FROM orders`,
      sql`SELECT to_char(date_trunc('month', created_at),'YYYY-MM') AS month, COUNT(*)::int AS orders, COALESCE(SUM(total_kobo) FILTER (WHERE payment_status='paid'),0)::bigint AS revenue_kobo, COALESCE(SUM(purchase_cost_kobo) FILTER (WHERE payment_status='paid'),0)::bigint AS purchase_cost_kobo, COALESCE(SUM(delivery_fee_kobo) FILTER (WHERE payment_status='paid'),0)::bigint AS delivery_cost_kobo, COALESCE(SUM(other_cost_kobo) FILTER (WHERE payment_status='paid'),0)::bigint AS other_cost_kobo, COALESCE(SUM(actual_profit_kobo) FILTER (WHERE payment_status='paid'),0)::bigint AS profit_kobo FROM orders WHERE created_at >= date_trunc('month', now()) - interval '11 months' GROUP BY 1 ORDER BY 1 DESC`,
      sql`SELECT payment_status, COUNT(*)::int AS orders, COALESCE(SUM(total_kobo),0)::bigint AS amount_kobo FROM orders GROUP BY payment_status ORDER BY payment_status`,
      sql`SELECT sourcing_status, COUNT(*)::int AS orders, COALESCE(SUM(total_kobo) FILTER (WHERE payment_status='paid'),0)::bigint AS paid_value_kobo FROM orders GROUP BY sourcing_status ORDER BY sourcing_status`,
    ]);
    return json(res, 200, { summary: summary[0], monthly, payments, sourcing });
  } catch {
    return json(res, 500, { error: 'Finance data could not be loaded.' });
  }
}
