import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from './db.js';
import { requireAdminPermission } from './auth.js';
import { recordAudit } from './audit.js';

export async function handleFinance(req: VercelRequest, res: VercelResponse, adminId: string) {
  const ok = await requireAdminPermission(req, res, 'finance.read');
  if (!ok) return true;
  const [summary] = await sql`
    SELECT
      COALESCE(SUM(total_kobo) FILTER (WHERE payment_status = 'paid'), 0)::bigint AS revenue_kobo,
      COALESCE(SUM(actual_profit_kobo) FILTER (WHERE payment_status = 'paid'), 0)::bigint AS profit_kobo,
      COALESCE(SUM(purchase_cost_kobo) FILTER (WHERE payment_status = 'paid'), 0)::bigint AS purchase_cost_kobo,
      COALESCE(SUM(delivery_fee_kobo) FILTER (WHERE payment_status = 'paid'), 0)::bigint AS delivery_cost_kobo,
      COALESCE(SUM(other_cost_kobo) FILTER (WHERE payment_status = 'paid'), 0)::bigint AS other_cost_kobo,
      COUNT(*) FILTER (WHERE payment_status = 'pending_verification')::int AS pending_orders,
      COUNT(*) FILTER (WHERE payment_status = 'rejected')::int AS rejected_orders
    FROM orders
    WHERE COALESCE(status, '') <> 'cancelled'`;
  const monthly = await sql`
    SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
      COUNT(*)::int AS orders,
      COALESCE(SUM(total_kobo) FILTER (WHERE payment_status = 'paid'), 0)::bigint AS revenue_kobo,
      COALESCE(SUM(actual_profit_kobo) FILTER (WHERE payment_status = 'paid'), 0)::bigint AS profit_kobo
    FROM orders
    WHERE created_at >= date_trunc('month', now()) - interval '11 months'
    GROUP BY 1
    ORDER BY 1`;
  const payments = await sql`
    SELECT payment_status, COUNT(*)::int AS orders, COALESCE(SUM(total_kobo), 0)::bigint AS amount_kobo
    FROM orders
    GROUP BY payment_status
    ORDER BY amount_kobo DESC`;
  const sourcing = await sql`
    SELECT COALESCE(sourcing_status, status) AS sourcing_status,
      COUNT(*)::int AS orders,
      COALESCE(SUM(total_kobo) FILTER (WHERE payment_status = 'paid'), 0)::bigint AS paid_value_kobo
    FROM orders
    WHERE COALESCE(status, '') <> 'cancelled'
    GROUP BY 1
    ORDER BY paid_value_kobo DESC`;
  json(res, 200, { summary: summary || {}, monthly, payments, sourcing });
  return true;
}

export async function handleAnalytics(req: VercelRequest, res: VercelResponse) {
  const ok = await requireAdminPermission(req, res, 'dashboard.read');
  if (!ok) return true;
  const daily = await sql`
    SELECT to_char(date_trunc('day', created_at), 'Mon DD') AS label,
      date_trunc('day', created_at)::date AS day,
      COUNT(*)::int AS orders,
      COALESCE(SUM(total_kobo) FILTER (WHERE payment_status = 'paid'), 0)::bigint AS revenue_kobo
    FROM orders
    WHERE created_at >= now() - interval '14 days'
    GROUP BY 2
    ORDER BY 2`;
  const statuses = await sql`SELECT COALESCE(status, 'unknown') AS status, COUNT(*)::int AS count FROM orders GROUP BY 1 ORDER BY count DESC`;
  const payments = await sql`SELECT COALESCE(payment_status, 'unknown') AS payment_status, COUNT(*)::int AS count FROM orders GROUP BY 1 ORDER BY count DESC`;
  const topProducts = await sql`
    SELECT p.name,
      COUNT(o.id)::int AS orders,
      COALESCE(SUM(o.total_kobo) FILTER (WHERE o.payment_status = 'paid'), 0)::bigint AS revenue_kobo
    FROM orders o
    JOIN products p ON p.id = o.product_id
    GROUP BY p.name
    ORDER BY revenue_kobo DESC, orders DESC
    LIMIT 8`;
  let searches: Array<{ query: string; count: number }> = [];
  try {
    searches = await sql`
      SELECT LOWER(payload->>'query') AS query, COUNT(*)::int AS count
      FROM analytics_events
      WHERE event_type = 'search' AND payload->>'query' IS NOT NULL AND created_at > now() - interval '14 days'
      GROUP BY 1
      HAVING LENGTH(LOWER(payload->>'query')) BETWEEN 2 AND 40
      ORDER BY count DESC
      LIMIT 8` as Array<{ query: string; count: number }>;
  } catch {
    searches = [];
  }
  json(res, 200, { daily, statuses, payments, topProducts, searches });
  return true;
}

export async function handleSettingsGet(req: VercelRequest, res: VercelResponse) {
  const ok = await requireAdminPermission(req, res, 'dashboard.read');
  if (!ok) return true;
  const rows = await sql`SELECT key, value, updated_at FROM platform_settings ORDER BY key`;
  json(res, 200, { settings: Object.fromEntries(rows.map((row) => [row.key, row.value])), updated: rows });
  return true;
}

export async function handleSettingsPatch(req: VercelRequest, res: VercelResponse, adminId: string) {
  const ok = await requireAdminPermission(req, res, 'dashboard.read');
  if (!ok) return true;
  const allowed = new Set([
    'payout_account_number',
    'payout_account_name',
    'payout_bank_name',
    'payment_method',
    'support_whatsapp',
    'support_phone',
    'store_name',
  ]);
  const incoming = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const entries = Object.entries(incoming).filter(([key, value]) => allowed.has(key) && typeof value === 'string');
  if (!entries.length) {
    json(res, 400, { error: 'No valid settings provided.' });
    return true;
  }
  for (const [key, value] of entries) {
    const clean = String(value).trim().slice(0, 120);
    await sql`
      INSERT INTO platform_settings (key, value, updated_at)
      VALUES (${key}, ${clean}, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  }
  await recordAudit({ actorUserId: adminId, action: 'settings.update', entityType: 'settings', entityId: 'platform', metadata: { keys: entries.map(([k]) => k) } });
  const rows = await sql`SELECT key, value FROM platform_settings ORDER BY key`;
  json(res, 200, { ok: true, settings: Object.fromEntries(rows.map((row) => [row.key, row.value])) });
  return true;
}
