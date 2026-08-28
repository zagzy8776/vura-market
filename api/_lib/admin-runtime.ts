import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from './db.js';
import { requireAdmin, requireAdminPermission } from './auth.js';
import { recordAudit, recordOrderEvent } from './audit.js';
import { applySecurityHeaders } from './http.js';
import { randomUUID } from 'crypto';
import { runAgent, getRun, getAgentPolicy, listTools } from './agents/runtime.js';
import { runTrendIntelligence } from './agents/trend-runner.js';
import { runProductIntelligence } from './agents/product-runner.js';
import { analyzeProductImages } from './agents/image-intelligence.js';
import { analyzeSales } from './agents/sales-intelligence.js';
import { analyzeOperations } from './agents/operations-intelligence.js';
import { scoutMarketing } from './agents/marketing-intelligence.js';
import { createAgentNotification } from './agents/notifications.js';
import { enqueueAgentJob, getJob } from './agents/job-queue.js';
import type { AgentId, ModelProvider } from './agents/types.js';
import { listAgentNotifications } from './agents/notifications.js';
import { listOpportunities, updateOpportunityStatus } from './agents/opportunities.js';
import type { OpportunityStatus } from './agents/opportunities.js';

const stockStatuses = new Set(['available', 'low_stock', 'out_of_stock', 'unavailable']);

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

function resource(req: VercelRequest) {
  const value = req.query.resource;
  return Array.isArray(value) ? value[0] : value || '';
}

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function imageUrls(input: unknown) {
  if (!Array.isArray(input)) return [] as string[];
  return input.filter((u): u is string => typeof u === 'string' && /^https:\/\//.test(String(u))).slice(0, 8);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applySecurityHeaders(res);
  const r = resource(req);
  if (r === 'health' && req.method === 'GET') {
    const requestId = randomUUID();
    try {
      const started = Date.now();
      const dbTest = await sql`SELECT 1`;
      res.setHeader('X-Request-ID', requestId);
      return json(res, 200, { status: 'healthy', database: { connected: !!dbTest.length, responseTimeMs: Date.now() - started }, timestamp: new Date().toISOString(), requestId });
    } catch {
      res.setHeader('X-Request-ID', requestId);
      return json(res, 500, { status: 'down', error: 'Health check failed', timestamp: new Date().toISOString(), requestId });
    }
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const method = (req.method || 'GET') as Method;

  try {
    if (r === 'categories') return categories(req, res, method, admin.id);
    if (r === 'products') return products(req, res, method, admin.id);
    if (r === 'suppliers' && method === 'GET') {
      const ok = await requireAdminPermission(req, res, 'suppliers.read');
      if (!ok) return;
      return json(res, 200, { suppliers: await sql`SELECT id,name,location,phone,notes,reliability_score,created_at,updated_at FROM suppliers ORDER BY updated_at DESC` });
    }
    if (r === 'overview' && method === 'GET') {
      const ok = await requireAdminPermission(req, res, 'dashboard.read');
      if (!ok) return;
      const [live] = await sql`SELECT COUNT(*)::int AS count FROM products WHERE is_active = true`;
      const [monthStats] = await sql`
        SELECT COUNT(*)::int AS orders, COALESCE(SUM(total_kobo), 0)::bigint AS revenue, COALESCE(SUM(actual_profit_kobo), 0)::bigint AS profit
        FROM orders WHERE created_at >= date_trunc('month', now()) AND COALESCE(status, '') <> 'cancelled'`;
      const [pendingPayment] = await sql`SELECT COUNT(*)::int AS count FROM orders WHERE payment_status IN ('unpaid', 'pending_verification') AND COALESCE(status, '') <> 'cancelled'`;
      const [toFulfill] = await sql`SELECT COUNT(*)::int AS count FROM orders WHERE payment_status = 'paid' AND COALESCE(status, '') NOT IN ('delivered', 'cancelled')`;
      const [lowStock] = await sql`SELECT COUNT(*)::int AS count FROM products WHERE is_active = true AND stock_status IN ('low_stock', 'out_of_stock')`;
      const recentOrders = await sql`SELECT o.id, o.order_number, o.total_kobo, o.status, o.payment_status, o.created_at, o.delivery_name, p.name AS product_name FROM orders o JOIN products p ON p.id = o.product_id ORDER BY o.created_at DESC LIMIT 8`;
      const customers = await sql`
        SELECT u.id, u.name, u.email,
          COUNT(o.id)::int AS order_count,
          COALESCE(SUM(o.total_kobo) FILTER (WHERE o.payment_status = 'paid'), 0)::bigint AS total_spend_kobo,
          (ARRAY_AGG(o.delivery_phone ORDER BY o.created_at DESC) FILTER (WHERE o.delivery_phone IS NOT NULL AND o.delivery_phone <> ''))[1] AS phone,
          (ARRAY_AGG(o.order_number ORDER BY o.created_at DESC) FILTER (WHERE o.order_number IS NOT NULL))[1] AS last_order_number
        FROM users u
        LEFT JOIN orders o ON o.buyer_id = u.id
        WHERE u.role = 'customer'
        GROUP BY u.id, u.name, u.email
        ORDER BY total_spend_kobo DESC NULLS LAST, u.created_at DESC
        LIMIT 200
      `;
      const audit = await sql`SELECT a.id, a.action, a.entity_type, a.entity_id, a.created_at, u.name AS actor_name, u.email AS actor_email FROM audit_log a LEFT JOIN users u ON u.id = a.actor_user_id ORDER BY a.created_at DESC LIMIT 100`;
      const orderEvents = await sql`SELECT e.id, e.event_type, e.order_id, e.created_at, u.name AS actor_name, o.order_number FROM order_events e LEFT JOIN users u ON u.id = e.actor_user_id LEFT JOIN orders o ON o.id = e.order_id ORDER BY e.created_at DESC LIMIT 100`;
      const notifications = await sql`
        SELECT n.id, n.type, n.title, n.body, n.order_id, n.created_at, n.read_at, o.order_number
        FROM notifications n
        LEFT JOIN orders o ON o.id = n.order_id
        WHERE n.type LIKE '%.admin' OR n.type LIKE 'order.%' OR n.type LIKE 'payment.%'
        ORDER BY n.created_at DESC
        LIMIT 40`;
      return json(res, 200, { liveProducts: live?.count || 0, monthlyOrders: monthStats?.orders || 0, monthlyRevenueKobo: Number(monthStats?.revenue || 0), monthlyProfitKobo: Number(monthStats?.profit || 0), attention: { pendingPayment: pendingPayment?.count || 0, toFulfill: toFulfill?.count || 0, lowStock: lowStock?.count || 0 }, recentOrders, customers, notifications, audit, orderEvents });
    }
    if (r === 'orders' && method === 'GET') {
      const ok = await requireAdminPermission(req, res, 'orders.read');
      if (!ok) return;
      const rows = await sql`SELECT o.id,o.order_number,o.quantity,o.total_kobo,o.status,o.payment_status,o.transfer_reference,o.payment_submitted_at,o.payment_verified_at,o.sourcing_status,o.delivery_name,o.delivery_phone,o.delivery_address,o.delivery_city,o.purchase_cost_kobo,o.delivery_fee_kobo,o.other_cost_kobo,o.actual_profit_kobo,o.created_at,p.name AS product_name,p.brand,s.name AS supplier_name,u.email AS buyer_email FROM orders o JOIN products p ON p.id=o.product_id LEFT JOIN suppliers s ON s.id=o.supplier_id JOIN users u ON u.id=o.buyer_id ORDER BY o.created_at DESC LIMIT 200`;
      return json(res, 200, { orders: rows });
    }
    if (r === 'orders' && method === 'PATCH') {
      const ok = await requireAdminPermission(req, res, 'orders.read');
      if (!ok) return;
      const body = req.body || {};
      const orderId = typeof body.orderId === 'string' ? body.orderId : '';
      if (!orderId) return json(res, 400, { error: 'Order id is required.' });
      const existing = await sql`SELECT o.id, o.order_number, o.status, o.payment_status, o.sourcing_status, o.buyer_id, u.email AS buyer_email, u.name AS buyer_name FROM orders o JOIN users u ON u.id = o.buyer_id WHERE o.id = ${orderId} LIMIT 1`;
      if (!existing[0]) return json(res, 404, { error: 'Order not found.' });
      const prev = existing[0];
      const status = typeof body.status === 'string' ? body.status : prev.status;
      const paymentStatus = typeof body.paymentStatus === 'string' ? body.paymentStatus : prev.payment_status;
      const sourcingStatus = typeof body.sourcingStatus === 'string' ? body.sourcingStatus : prev.sourcing_status;
      const supplierId = body.supplierId === null || body.supplierId === '' ? null : (typeof body.supplierId === 'string' ? body.supplierId : undefined);
      const purchaseCostKobo = body.purchaseCostKobo === null ? null : (body.purchaseCostKobo === undefined ? undefined : Number(body.purchaseCostKobo));
      const deliveryFeeKobo = body.deliveryFeeKobo === undefined ? undefined : Number(body.deliveryFeeKobo);
      const otherCostKobo = body.otherCostKobo === undefined ? undefined : Number(body.otherCostKobo);
      const totalRow = await sql`SELECT total_kobo FROM orders WHERE id = ${orderId} LIMIT 1`;
      const totalKobo = Number(totalRow[0]?.total_kobo || 0);
      const pc = purchaseCostKobo === undefined ? undefined : purchaseCostKobo;
      const df = deliveryFeeKobo === undefined ? undefined : deliveryFeeKobo;
      const oc = otherCostKobo === undefined ? undefined : otherCostKobo;
      let profit: number | undefined;
      if (pc !== undefined || df !== undefined || oc !== undefined) {
        const cur = await sql`SELECT purchase_cost_kobo, delivery_fee_kobo, other_cost_kobo FROM orders WHERE id = ${orderId}`;
        const p = pc !== undefined ? Number(pc || 0) : Number(cur[0]?.purchase_cost_kobo || 0);
        const d = df !== undefined ? Number(df || 0) : Number(cur[0]?.delivery_fee_kobo || 0);
        const oth = oc !== undefined ? Number(oc || 0) : Number(cur[0]?.other_cost_kobo || 0);
        profit = totalKobo - p - d - oth;
      }
      await sql`UPDATE orders SET status = ${status}, payment_status = ${paymentStatus}, sourcing_status = ${sourcingStatus}, purchase_cost_kobo = COALESCE(${pc === undefined ? null : pc}, purchase_cost_kobo), delivery_fee_kobo = COALESCE(${df === undefined ? null : df}, delivery_fee_kobo), other_cost_kobo = COALESCE(${oc === undefined ? null : oc}, other_cost_kobo), actual_profit_kobo = COALESCE(${profit === undefined ? null : profit}, actual_profit_kobo), payment_verified_at = CASE WHEN ${paymentStatus} = 'paid' AND COALESCE(payment_status, '') <> 'paid' THEN now() ELSE payment_verified_at END, updated_at = now() WHERE id = ${orderId}`;
      if (typeof supplierId === 'string') {
        await sql`UPDATE orders SET supplier_id = ${supplierId}, updated_at = now() WHERE id = ${orderId}`;
      } else if (body.supplierId === null || body.supplierId === '') {
        await sql`UPDATE orders SET supplier_id = null, updated_at = now() WHERE id = ${orderId}`;
      }
      try {
        const { notifyCustomerOrderChange } = await import('./notifications.js');
        await notifyCustomerOrderChange({ userId: String(prev.buyer_id), email: String(prev.buyer_email), firstName: String(prev.buyer_name || 'Customer'), orderId: String(prev.id), orderNumber: String(prev.order_number), prevStatus: prev.status, nextStatus: status, prevPayment: prev.payment_status, nextPayment: paymentStatus });
      } catch { /* ignore */ }
      try {
        if (status !== prev.status || paymentStatus !== prev.payment_status) {
          await recordOrderEvent({ actorUserId: admin.id, orderId, eventType: paymentStatus !== prev.payment_status ? `payment.${paymentStatus}` : `status.${status}`, fromStatus: String(prev.status || ''), toStatus: String(status || ''), note: paymentStatus !== prev.payment_status ? `payment:${prev.payment_status}->${paymentStatus}` : undefined });
        }
      } catch { /* ignore */ }
      await recordAudit({ actorUserId: admin.id, action: 'order.update', entityType: 'order', entityId: orderId, metadata: { status, paymentStatus, sourcingStatus } });
      return json(res, 200, { ok: true });
    }
    if (r === 'promo' && method === 'POST') {
      const ok = await requireAdminPermission(req, res, 'dashboard.read');
      if (!ok) return;
      const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
      const bodyText = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
      const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
      if (title.length < 3 || bodyText.length < 3) return json(res, 400, { error: 'Title and message are required (min 3 characters).' });
      const { notifyPromoToCustomers } = await import('./notifications.js');
      const result = await notifyPromoToCustomers({ title, body: bodyText, url: url || undefined });
      await recordAudit({ actorUserId: admin.id, action: 'promo.send', entityType: 'promo', entityId: 'promo', metadata: { title, sent: result.sent } });
      return json(res, 200, { ok: true, sent: result.sent });
    }
    if (r === 'notifications' && method === 'GET') {
      const ok = await requireAdminPermission(req, res, 'notifications.read');
      if (!ok) return;
      const rows = await sql`SELECT n.id,n.user_id,n.order_id,n.type,n.title,n.body,n.created_at,u.email AS user_email,o.order_number FROM notifications n LEFT JOIN users u ON u.id=n.user_id LEFT JOIN orders o ON o.id=n.order_id ORDER BY n.created_at DESC LIMIT 200`;
      return json(res, 200, { notifications: rows });
    }
    if (r === 'finance' && method === 'GET') {
      const ok = await requireAdminPermission(req, res, 'finance.read');
      if (!ok) return;
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
      return json(res, 200, { summary: summary || {}, monthly, payments, sourcing });
    }
    if (r === 'analytics' && method === 'GET') {
      const ok = await requireAdminPermission(req, res, 'dashboard.read');
      if (!ok) return;
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
      return json(res, 200, { daily, statuses, payments, topProducts, searches });
    }
    if (r === 'settings' && method === 'GET') {
      const ok = await requireAdminPermission(req, res, 'dashboard.read');
      if (!ok) return;
      const rows = await sql`SELECT key, value, updated_at FROM platform_settings ORDER BY key`;
      return json(res, 200, { settings: Object.fromEntries(rows.map((row) => [row.key, row.value])), updated: rows });
    }
    if (r === 'settings' && method === 'PATCH') {
      const ok = await requireAdminPermission(req, res, 'dashboard.read');
      if (!ok) return;
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
      if (!entries.length) return json(res, 400, { error: 'No valid settings provided.' });
      for (const [key, value] of entries) {
        const clean = String(value).trim().slice(0, 120);
        await sql`
          INSERT INTO platform_settings (key, value, updated_at)
          VALUES (${key}, ${clean}, now())
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
      }
      await recordAudit({ actorUserId: admin.id, action: 'settings.update', entityType: 'settings', entityId: 'platform', metadata: { keys: entries.map(([k]) => k) } });
      const rows = await sql`SELECT key, value FROM platform_settings ORDER BY key`;
      return json(res, 200, { ok: true, settings: Object.fromEntries(rows.map((row) => [row.key, row.value])) });
    }

    // --- Agent runtime (consolidated under admin.ts to stay ≤12 Vercel functions) ---
    if (r === 'agents') {
      const ok = await requireAdminPermission(req, res, 'dashboard.read');
      if (!ok) return;
      const requestId = randomUUID();
      res.setHeader('X-Request-ID', requestId);
      const agentIds = new Set<AgentId>([
        'product-intelligence', 'trend-intelligence', 'marketing-intelligence', 'sales', 'operations', 'engineering',
      ]);
      const providers = new Set<ModelProvider>(['groq', 'cerebras', 'gemini']);
      if (method === 'GET') {
        const runId = typeof req.query.runId === 'string' ? req.query.runId : '';
        if (!runId) return json(res, 400, { error: 'runId is required.', requestId });
        const job = await getJob(runId);
        if (job) return json(res, 200, { run: job, requestId, mode: 'job' });
        const run = await getRun(runId);
        return run ? json(res, 200, { run, requestId, mode: 'legacy' }) : json(res, 404, { error: 'Agent run not found.', requestId });
      }
      if (method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
      const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
      const agentId = typeof body.agentId === 'string' ? body.agentId as AgentId : null;
      const task = typeof body.task === 'string' ? body.task.trim() : '';
      const requestedProviders = Array.isArray(body.providers)
        ? body.providers.filter((value): value is ModelProvider => typeof value === 'string' && providers.has(value as ModelProvider))
        : undefined;
      if (!agentId || !agentIds.has(agentId)) return json(res, 400, { error: 'Unknown agent.', requestId });
      if (task.length < 3 || task.length > 4000) return json(res, 400, { error: 'Task must be between 3 and 4000 characters.', requestId });
      if (requestedProviders && requestedProviders.length === 0) return json(res, 400, { error: 'No valid model providers supplied.', requestId });
      const sync = body.sync === true || body.mode === 'sync';
      const longRunning = new Set([
        'trend-intelligence', 'product-intelligence', 'marketing-intelligence', 'sales', 'operations', 'engineering',
      ]);

      try {
        // Phase N: default async enqueue for long-running agents (Fly worker executes)
        if (!sync && longRunning.has(agentId)) {
          const jobInput: Record<string, unknown> = {
            categories: body.categories,
            opportunityId: body.opportunityId,
            productName: body.productName,
            category: body.category,
            imageUrls: body.imageUrls,
            jobType: body.jobType,
            userNotes: body.userNotes,
          };
          const enqueued = await enqueueAgentJob({
            agentId,
            task,
            input: jobInput,
            idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : undefined,
          });
          return json(res, 202, {
            requestId,
            mode: 'queued',
            runId: enqueued.runId,
            status: enqueued.status,
            deduped: enqueued.deduped,
            message: 'Job queued for Fly agent worker. Poll GET /api/admin?resource=agents&runId=...',
            policy: getAgentPolicy(agentId),
            tools: listTools(agentId).map((tool) => ({ name: tool.name, description: tool.description, risk: tool.risk })),
          });
        }

        if (agentId === 'trend-intelligence') {
          const runId = randomUUID();
          await sql`INSERT INTO agent_runs (id, agent_id, task, status) VALUES (${runId}, ${agentId}, ${task}, 'running')`.catch(() => undefined);
          const trend = await runTrendIntelligence({ agentId, runId, task }, Array.isArray(body.categories) ? body.categories.filter((c): c is string => typeof c === 'string') : undefined);
          const tools = listTools(agentId).map((tool) => ({ name: tool.name, description: tool.description, risk: tool.risk }));
          return json(res, 200, { requestId, policy: getAgentPolicy(agentId), tools, run: { id: runId, agentId, status: 'completed' }, ...trend });
        }
        if (agentId === 'product-intelligence') {
          const runId = randomUUID();
          await sql`INSERT INTO agent_runs (id, agent_id, task, status) VALUES (${runId}, ${agentId}, ${task}, 'running')`.catch(() => undefined);
          const opportunityId = typeof body.opportunityId === 'string' ? body.opportunityId.trim() : undefined;
          const productName = typeof body.productName === 'string' ? body.productName.trim() : (task || undefined);
          const category = typeof body.category === 'string' ? body.category.trim() : undefined;
          const imageUrls = Array.isArray(body.imageUrls) ? body.imageUrls.filter((u: unknown): u is string => typeof u === 'string') : [];
          const product = imageUrls.length
            ? await analyzeProductImages({ agentId, runId, task }, {
                imageUrls,
                productNameHint: productName,
                categoryHint: category,
                userNotes: typeof body.userNotes === 'string' ? body.userNotes : undefined,
              })
            : await runProductIntelligence({ agentId, runId, task }, { opportunityId, productName, category });
          const tools = listTools(agentId).map((tool) => ({ name: tool.name, description: tool.description, risk: tool.risk }));
          return json(res, 200, { requestId, policy: getAgentPolicy(agentId), tools, run: { id: runId, agentId, status: 'completed' }, ...product });
        }
        
        if (agentId === 'sales') {
          const runId = randomUUID();
          await sql`INSERT INTO agent_runs (id, agent_id, task, status) VALUES (${runId}, ${agentId}, ${task}, 'running')`.catch(() => undefined);
          const sales = await analyzeSales({ agentId, runId, task });
          await createAgentNotification({
            title: 'Sales intelligence report',
            message: (sales.insights || []).slice(0, 3).join(' '),
            severity: 'info',
            agentId,
            metadata: { runId },
          }).catch(() => undefined);
          await sql`UPDATE agent_runs SET status = 'completed', completed_at = now() WHERE id = ${runId}`.catch(() => undefined);
          return json(res, 200, { requestId, policy: getAgentPolicy(agentId), tools: listTools(agentId).map((tool) => ({ name: tool.name, description: tool.description, risk: tool.risk })), run: { id: runId, agentId, status: 'completed' }, ...sales });
        }
        if (agentId === 'operations') {
          const runId = randomUUID();
          await sql`INSERT INTO agent_runs (id, agent_id, task, status) VALUES (${runId}, ${agentId}, ${task}, 'running')`.catch(() => undefined);
          const ops = await analyzeOperations({ agentId, runId, task });
          await createAgentNotification({
            title: 'Operations snapshot',
            message: (ops.alerts || []).slice(0, 3).join(' '),
            severity: 'info',
            agentId,
            metadata: { runId },
          }).catch(() => undefined);
          await sql`UPDATE agent_runs SET status = 'completed', completed_at = now() WHERE id = ${runId}`.catch(() => undefined);
          return json(res, 200, { requestId, policy: getAgentPolicy(agentId), tools: listTools(agentId).map((tool) => ({ name: tool.name, description: tool.description, risk: tool.risk })), run: { id: runId, agentId, status: 'completed' }, ...ops });
        }
        if (agentId === 'marketing-intelligence') {
          const runId = randomUUID();
          await sql`INSERT INTO agent_runs (id, agent_id, task, status) VALUES (${runId}, ${agentId}, ${task}, 'running')`.catch(() => undefined);
          const marketing = await scoutMarketing({ agentId, runId, task }, task);
          await createAgentNotification({
            title: 'Marketing scout brief',
            message: marketing.brief && typeof marketing.brief === 'object' && 'trend' in marketing.brief
              ? String((marketing.brief as { trend?: string }).trend || 'Brief ready')
              : (marketing.note || 'Scout completed'),
            severity: 'info',
            agentId,
            metadata: { runId },
          }).catch(() => undefined);
          await sql`UPDATE agent_runs SET status = 'completed', completed_at = now() WHERE id = ${runId}`.catch(() => undefined);
          return json(res, 200, { requestId, policy: getAgentPolicy(agentId), tools: listTools(agentId).map((tool) => ({ name: tool.name, description: tool.description, risk: tool.risk })), run: { id: runId, agentId, status: 'completed' }, ...marketing });
        }
const result = await runAgent({ agentId, task, providers: requestedProviders });
        const tools = listTools(agentId).map((tool) => ({ name: tool.name, description: tool.description, risk: tool.risk }));
        return json(res, 200, { requestId, policy: getAgentPolicy(agentId), tools, ...result });
      } catch (error) {
        return json(res, 500, { error: error instanceof Error ? error.message : 'Agent execution failed.', requestId });
      }
    }

    if (r === 'agent-jobs') {
      const ok = await requireAdminPermission(req, res, 'dashboard.read');
      if (!ok) return;
      const requestId = randomUUID();
      res.setHeader('X-Request-ID', requestId);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const status = typeof req.query.status === 'string' ? req.query.status : '';
      const rows = status
        ? await sql`SELECT id, agent_id, task, status, attempts, error, provider, model, started_at, completed_at, metadata, result FROM agent_runs WHERE status = ${status} ORDER BY started_at DESC LIMIT ${limit}`
        : await sql`SELECT id, agent_id, task, status, attempts, error, provider, model, started_at, completed_at, metadata, result FROM agent_runs ORDER BY started_at DESC LIMIT ${limit}`;
      return json(res, 200, { jobs: rows, requestId });
    }
    if (r === 'agent-memory') {
      const ok = await requireAdminPermission(req, res, 'dashboard.read');
      if (!ok) return;
      const requestId = randomUUID();
      res.setHeader('X-Request-ID', requestId);
      const { recall } = await import('./agents/memory.js');
      const agentId = typeof req.query.agentId === 'string' ? req.query.agentId : undefined;
      const rows = await recall({ agentId, limit: 40 });
      return json(res, 200, { memory: rows, requestId });
    }
    if (r === 'agent-schedules') {
      const ok = await requireAdminPermission(req, res, 'dashboard.read');
      if (!ok) return;
      const requestId = randomUUID();
      res.setHeader('X-Request-ID', requestId);
      const rows = await sql`SELECT id, agent_id, task, interval_minutes, enabled, last_enqueued_at, next_run_at FROM agent_schedules ORDER BY id`;
      return json(res, 200, { schedules: rows, requestId });
    }
    if (r === 'agent-approvals') {
      const ok = await requireAdminPermission(req, res, 'dashboard.read');
      if (!ok) return;
      const requestId = randomUUID();
      res.setHeader('X-Request-ID', requestId);
      if (method === 'GET') {
        const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
        if (!['pending', 'approved', 'rejected', 'expired'].includes(status)) return json(res, 400, { error: 'Invalid approval status.', requestId });
        const rows = await sql`
          SELECT a.id, a.run_id, a.agent_id, a.tool_name, a.risk, a.input, a.status, a.requested_at, a.decided_at, a.decided_by, a.decision_note
          FROM agent_approvals a WHERE a.status = ${status} ORDER BY a.requested_at DESC LIMIT 100`;
        return json(res, 200, { approvals: rows, requestId });
      }
      if (method !== 'PATCH') return json(res, 405, { error: 'Method not allowed.' });
      const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
      const approvalId = typeof body.approvalId === 'string' ? body.approvalId : '';
      const decision = body.decision === 'approved' || body.decision === 'rejected' ? body.decision : '';
      const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : null;
      if (!approvalId || !decision) return json(res, 400, { error: 'approvalId and decision are required.', requestId });
      const updated = await sql`
        UPDATE agent_approvals
        SET status = ${decision}, decided_at = now(), decided_by = ${admin.id}, decision_note = ${note}
        WHERE id = ${approvalId} AND status = 'pending'
        RETURNING id, run_id, agent_id, tool_name, risk, status, decided_at`;
      if (!updated[0]) return json(res, 409, { error: 'Approval is missing or already decided.', requestId });
      await sql`UPDATE agent_runs SET status = CASE WHEN ${decision} = 'approved' THEN 'running' ELSE 'failed' END WHERE id = ${updated[0].run_id} AND status = 'awaiting_approval'`;
      await sql`INSERT INTO agent_events (id, run_id, event_type, tool_name, risk, output) VALUES (${randomUUID()}, ${updated[0].run_id}, ${'approval.' + decision}, ${updated[0].tool_name}, ${updated[0].risk}, ${JSON.stringify({ decidedBy: admin.id, note })}::jsonb)`;
      return json(res, 200, { ok: true, approval: updated[0], requestId });
    }

    if (r === 'agent-notifications' && method === 'GET') {
      const ok = await requireAdminPermission(req, res, 'dashboard.read');
      if (!ok) return;
      const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
      if (!Number.isFinite(rawLimit)) return json(res, 400, { error: 'Invalid limit.' });
      return json(res, 200, { notifications: await listAgentNotifications(rawLimit) });
    }

    if (r === 'agent-opportunities') {
      const ok = await requireAdminPermission(req, res, 'dashboard.read');
      if (!ok) return;
      const statuses = new Set<OpportunityStatus>(['new', 'watching', 'investigating', 'approved', 'dismissed']);
      if (method === 'GET') {
        const status = typeof req.query.status === 'string' && statuses.has(req.query.status as OpportunityStatus)
          ? req.query.status as OpportunityStatus : undefined;
        const category = typeof req.query.category === 'string' ? req.query.category.trim().slice(0, 160) : undefined;
        const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
        if (!Number.isFinite(limit)) return json(res, 400, { error: 'Invalid limit.' });
        return json(res, 200, { opportunities: await listOpportunities({ status, category, limit }) });
      }
      if (method !== 'PATCH') return json(res, 405, { error: 'Method not allowed.' });
      const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
      const id = typeof body.id === 'string' ? body.id.trim() : '';
      const status = typeof body.status === 'string' ? body.status as OpportunityStatus : null;
      if (!id || !status || !statuses.has(status)) return json(res, 400, { error: 'Valid id and status are required.' });
      const opportunity = await updateOpportunityStatus(id, status);
      return opportunity ? json(res, 200, { opportunity }) : json(res, 404, { error: 'Opportunity not found.' });
    }

    return json(res, 404, { error: 'Admin resource not found.' });
  } catch {
    return json(res, 500, { error: 'The admin operation could not be completed.' });
  }
}

async function categories(req: VercelRequest, res: VercelResponse, method: Method, adminId: string) {
  const permission = method === 'GET' ? 'categories.read' : 'categories.create';
  const admin = await requireAdminPermission(req, res, permission);
  if (!admin) return;
  if (method === 'GET') {
    const rows = await sql`SELECT id,name,slug,icon FROM categories ORDER BY name ASC`;
    return json(res, 200, { categories: rows });
  }
  if (method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const icon = typeof req.body?.icon === 'string' && req.body.icon.trim() ? req.body.icon.trim() : 'Package';
  if (name.length < 2) return json(res, 400, { error: 'Category name is required.' });
  const base = slugify(name) || `category-${Date.now()}`;
  let slug = base;
  for (let i = 2; i < 30; i++) {
    const existing = await sql`SELECT id FROM categories WHERE slug=${slug} LIMIT 1`;
    if (!existing[0]) break;
    slug = `${base}-${i}`;
  }
  try {
    const rows = await sql`INSERT INTO categories(name,slug,icon) VALUES(${name},${slug},${icon}) RETURNING id,name,slug,icon`;
    await recordAudit({ actorUserId: admin.id, action: 'category.create', entityType: 'category', entityId: rows[0].id, afterData: rows[0] });
    return json(res, 201, { category: rows[0] });
  } catch {
    return json(res, 409, { error: 'A category with that name already exists.' });
  }
}

async function products(req: VercelRequest, res: VercelResponse, method: Method, adminId: string) {
  const permission = method === 'GET' ? 'products.read' : (method === 'POST' ? 'products.create' : 'products.write');
  const admin = await requireAdminPermission(req, res, permission);
  if (!admin) return;
  if (method === 'GET') {
    const rows = await sql`SELECT p.id,p.name,p.brand,p.description,p.price_kobo,p.condition_label,p.storage,p.color,p.stock_status,p.is_active,p.source_price_kobo,p.source_location,p.expected_cost_kobo,p.verified_at,p.category_id,p.supplier_id,s.name AS supplier_name,c.name AS category,ARRAY_AGG(pi.image_url ORDER BY pi.sort_order) FILTER (WHERE pi.image_url IS NOT NULL) AS images FROM products p LEFT JOIN suppliers s ON s.id=p.supplier_id LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN product_images pi ON pi.product_id=p.id GROUP BY p.id,s.name,c.name ORDER BY p.created_at DESC LIMIT 500`;
    return json(res, 200, { products: rows });
  }
  const body = req.body || {};
  if (method === 'POST') {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const brand = typeof body.brand === 'string' ? body.brand.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    const price = Number(body.priceKobo);
    const sourcePrice = body.sourcePriceKobo == null || body.sourcePriceKobo === '' ? null : Number(body.sourcePriceKobo);
    const condition = typeof body.conditionLabel === 'string' && body.conditionLabel.trim() ? body.conditionLabel.trim() : 'New';
    const stock = typeof body.stockStatus === 'string' ? body.stockStatus : 'available';
    const urls = imageUrls(body.images);
    if (name.length < 2 || brand.length < 1) return json(res, 400, { error: 'Product name and brand are required.' });
    if (!Number.isFinite(price) || price <= 0) return json(res, 400, { error: 'Product price must be greater than zero.' });
    if (!stockStatuses.has(stock)) return json(res, 400, { error: 'Invalid stock status.' });
    if (urls.length < 1) return json(res, 400, { error: 'Add at least one product photo.' });
    const rows = await sql`INSERT INTO products(seller_id,category_id,supplier_id,name,brand,description,price_kobo,condition_label,storage,color,stock_status,source_price_kobo,source_location,expected_cost_kobo,is_active,verified_at) VALUES(${adminId},${body.categoryId||null},${body.supplierId||null},${name},${brand},${description},${Math.round(price)},${condition},${body.storage||null},${body.color||null},${stock},${sourcePrice===null?null:Math.round(sourcePrice)},${body.sourceLocation||null},${sourcePrice===null?null:Math.round(sourcePrice)},true,now()) RETURNING id`;
    await sql`INSERT INTO product_images (product_id, image_url, sort_order) SELECT ${rows[0].id}, image_value, ordinality - 1 FROM unnest(${urls}::text[]) WITH ORDINALITY AS t(image_value, ordinality)`;
    await recordAudit({ actorUserId: adminId, action: 'product.create', entityType: 'product', entityId: rows[0].id });
    return json(res, 201, { product: { id: rows[0].id, images: urls } });
  }
  if (method === 'DELETE') {
    const productId = body.productId;
    if (typeof productId !== 'string') return json(res, 400, { error: 'Product is required.' });
    const before = await sql`SELECT id, name, is_active FROM products WHERE id=${productId} LIMIT 1`;
    if (!before[0]) return json(res, 404, { error: 'Product not found.' });
    try {
      await sql`DELETE FROM product_images WHERE product_id=${productId}`;
      await sql`DELETE FROM products WHERE id=${productId}`;
      await recordAudit({ actorUserId: adminId, action: 'product.delete', entityType: 'product', entityId: productId, beforeData: before[0] });
      return json(res, 200, { deleted: true, productId });
    } catch {
      await sql`UPDATE products SET is_active=false, stock_status='unavailable', updated_at=now() WHERE id=${productId}`;
      await recordAudit({ actorUserId: adminId, action: 'product.deactivate', entityType: 'product', entityId: productId, beforeData: before[0] });
      return json(res, 200, { deleted: false, deactivated: true, productId, message: 'Product has related orders so it was deactivated instead of fully removed.' });
    }
  }
  if (method !== 'PATCH') return json(res, 405, { error: 'Method not allowed' });
  const productId = body.productId;
  if (typeof productId !== 'string') return json(res, 400, { error: 'Product is required.' });
  const before = await sql`SELECT id FROM products WHERE id=${productId} LIMIT 1`;
  if (!before[0]) return json(res, 404, { error: 'Product not found.' });
  const numericPrice = body.priceKobo == null || body.priceKobo === '' ? null : Number(body.priceKobo);
  const numericSource = body.sourcePriceKobo == null || body.sourcePriceKobo === '' ? null : Number(body.sourcePriceKobo);
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
  const brand = typeof body.brand === 'string' && body.brand.trim() ? body.brand.trim() : null;
  const description = typeof body.description === 'string' ? body.description.trim() : null;
  const condition = typeof body.conditionLabel === 'string' && body.conditionLabel.trim() ? body.conditionLabel.trim() : null;
  const stockStatus = typeof body.stockStatus === 'string' ? body.stockStatus : null;
  await sql`UPDATE products SET name=COALESCE(${name},name), brand=COALESCE(${brand},brand), description=COALESCE(${description},description), condition_label=COALESCE(${condition},condition_label), storage=COALESCE(${body.storage||null},storage), color=COALESCE(${body.color||null},color), category_id=COALESCE(${body.categoryId||null},category_id), supplier_id=COALESCE(${body.supplierId||null},supplier_id), source_location=COALESCE(${body.sourceLocation||null},source_location), stock_status=COALESCE(${stockStatus},stock_status), is_active=COALESCE(${typeof body.isActive==='boolean'?body.isActive:null},is_active), price_kobo=COALESCE(${numericPrice===null?null:Math.round(numericPrice)},price_kobo), source_price_kobo=COALESCE(${numericSource===null?null:Math.round(numericSource)},source_price_kobo), expected_cost_kobo=COALESCE(${numericSource===null?null:Math.round(numericSource)},expected_cost_kobo), verified_at=now(), updated_at=now() WHERE id=${productId}`;
  if (Array.isArray(body.images)) {
    const urls = imageUrls(body.images);
    await sql`DELETE FROM product_images WHERE product_id=${productId}`;
    if (urls.length) await sql`INSERT INTO product_images (product_id, image_url, sort_order) SELECT ${productId}, image_value, ordinality - 1 FROM unnest(${urls}::text[]) WITH ORDINALITY AS t(image_value, ordinality)`;
  }
  await recordAudit({ actorUserId: adminId, action: 'product.update', entityType: 'product', entityId: productId });
  return json(res, 200, { product: { id: productId } });
}
