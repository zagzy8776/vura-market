import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  if (!await requireAdmin(req, res)) return;
  try {
    const [products, orders, revenue, profit, customers, notifications] = await Promise.all([
      sql`SELECT COUNT(*)::int AS count FROM products WHERE is_active = true`,
      sql`SELECT COUNT(*)::int AS count FROM orders WHERE created_at >= date_trunc('month', now())`,
      sql`SELECT COALESCE(SUM(total_kobo),0)::bigint AS amount FROM orders WHERE payment_status = 'paid' AND created_at >= date_trunc('month', now())`,
      sql`SELECT COALESCE(SUM(actual_profit_kobo),0)::bigint AS amount FROM orders WHERE payment_status = 'paid' AND actual_profit_kobo IS NOT NULL AND created_at >= date_trunc('month', now())`,
      sql`SELECT u.id, u.name, u.email, u.role, u.created_at, COUNT(o.id)::int AS order_count, COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.total_kobo ELSE 0 END), 0)::bigint AS total_spend_kobo FROM users u LEFT JOIN orders o ON o.buyer_id = u.id WHERE u.role = 'customer' GROUP BY u.id ORDER BY u.created_at DESC LIMIT 1000`,
      sql`SELECT n.id, n.user_id, n.order_id, n.type, n.title, n.body, n.created_at, u.email AS user_email, o.order_number FROM notifications n JOIN users u ON u.id = n.user_id LEFT JOIN orders o ON o.id = n.order_id ORDER BY n.created_at DESC LIMIT 300`,
    ]);
    return json(res, 200, {
      liveProducts: products[0].count,
      monthlyOrders: orders[0].count,
      monthlyRevenueKobo: revenue[0].amount,
      monthlyProfitKobo: profit[0].amount,
      customers,
      notifications,
    });
  } catch {
    return json(res, 500, { error: 'We could not load the dashboard.' });
  }
}
