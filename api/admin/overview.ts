import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  if (!await requireAdmin(req, res)) return;
  try {
    const [products, orders, revenue, profit] = await Promise.all([
      sql`SELECT COUNT(*)::int AS count FROM products WHERE is_active = true`,
      sql`SELECT COUNT(*)::int AS count FROM orders WHERE created_at >= date_trunc('month', now())`,
      sql`SELECT COALESCE(SUM(total_kobo),0)::bigint AS amount FROM orders WHERE payment_status = 'paid' AND created_at >= date_trunc('month', now())`,
      sql`SELECT COALESCE(SUM(actual_profit_kobo),0)::bigint AS amount FROM orders WHERE payment_status = 'paid' AND actual_profit_kobo IS NOT NULL AND created_at >= date_trunc('month', now())`,
    ]);
    return json(res, 200, { liveProducts: products[0].count, monthlyOrders: orders[0].count, monthlyRevenueKobo: revenue[0].amount, monthlyProfitKobo: profit[0].amount });
  } catch { return json(res, 500, { error: 'We could not load the dashboard.' }); }
}
