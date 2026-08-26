/// <reference types="node" />
// Scheduled operations worker. Run periodically (cron / scheduled function):
//   DATABASE_URL=... npm run jobs:run
// Jobs are idempotent and safe to run concurrently with the API.
import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const sql = neon(databaseUrl);

async function evaluatePayoutEligibility(): Promise<string> {
  const rows = await sql`SELECT evaluate_payout_eligibility() AS released`;
  return `payout eligibility: released ${Number(rows[0].released)} payable(s)`;
}

async function detectSlaViolations(): Promise<string[]> {
  const settings = await sql`SELECT key, value FROM platform_settings WHERE key IN ('sla_dispatch_hours','sla_delivery_hours','sla_defect_rate_max_pct','sla_on_time_min_pct')`;
  const num = (key: string, fallback: number) => {
    const row = settings.find((s) => s.key === key);
    const parsed = row ? Number(row.value) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  const dispatchHours = num('sla_dispatch_hours', 48);
  const deliveryHours = num('sla_delivery_hours', 120);
  const defectMaxPct = num('sla_defect_rate_max_pct', 10);
  const onTimeMinPct = num('sla_on_time_min_pct', 80);

  // Real measurements from fulfillment data — never invented scores.
  const rows = await sql`
    SELECT s.id AS supplier_id, s.name,
      COUNT(f.id) FILTER (WHERE f.dispatched_at IS NOT NULL AND f.dispatched_at - f.created_at > make_interval(hours => ${dispatchHours}))::int AS late_dispatches,
      COUNT(f.id) FILTER (WHERE f.dispatched_at IS NOT NULL)::int AS dispatched_total,
      COUNT(f.id) FILTER (WHERE f.status = 'delivered' AND f.delivered_at - f.dispatched_at > make_interval(hours => ${deliveryHours}))::int AS late_deliveries,
      COUNT(f.id) FILTER (WHERE f.status = 'delivered')::int AS delivered_total,
      COUNT(f.id) FILTER (WHERE f.status = 'cancelled')::int AS cancelled_total,
      COUNT(f.id)::int AS total_shipments,
      (SELECT COUNT(*)::int FROM return_requests rr JOIN order_fulfillments f2 ON f2.id = rr.fulfillment_id WHERE f2.supplier_id = s.id) AS returns_total
    FROM suppliers s
    LEFT JOIN order_fulfillments f ON f.supplier_id = s.id
    GROUP BY s.id, s.name`;

  const messages: string[] = [];
  for (const m of rows) {
    const candidates: Array<{ type: string; detail: Record<string, unknown> }> = [];
    if (m.dispatched_total > 0) {
      const onTimePct = 100 * (m.dispatched_total - m.late_dispatches) / m.dispatched_total;
      if (onTimePct < onTimeMinPct) candidates.push({ type: 'low_on_time_rate', detail: { on_time_pct: Math.round(onTimePct * 100) / 100, threshold_pct: onTimeMinPct } });
      if (m.late_deliveries > 0) candidates.push({ type: 'late_delivery', detail: { late_deliveries: m.late_deliveries, threshold_hours: deliveryHours } });
    }
    if (m.delivered_total > 0) {
      const defectPct = 100 * m.returns_total / m.delivered_total;
      if (defectPct > defectMaxPct) candidates.push({ type: 'high_defect_rate', detail: { defect_pct: Math.round(defectPct * 100) / 100, threshold_pct: defectMaxPct } });
    }
    if (m.total_shipments >= 5 && m.cancelled_total / m.total_shipments > 0.2) {
      candidates.push({ type: 'high_cancellation_rate', detail: { cancelled: m.cancelled_total, total: m.total_shipments } });
    }
    for (const candidate of candidates) {
      const inserted = await sql`
        INSERT INTO sla_violations(supplier_id, violation_type, reference_id, detail)
        VALUES (${m.supplier_id}::uuid, ${candidate.type}, ${m.supplier_id}::uuid, ${JSON.stringify(candidate.detail)}::jsonb)
        ON CONFLICT (supplier_id, violation_type, reference_id) DO NOTHING
        RETURNING id`;
      if (inserted[0]) messages.push(`SLA violation: ${m.name} — ${candidate.type}`);
    }
  }
  return messages.length ? messages : ['SLA scan complete: no new violations'];
}

const WEBHOOK_MAX_RETRIES = 5;

async function retryCourierWebhooks(): Promise<string> {
  // Dead-letter anything that exhausted retries so it surfaces in Studio recovery.
  await sql`UPDATE courier_webhook_events SET status = 'dead_letter' WHERE status = 'failed' AND retry_count >= ${WEBHOOK_MAX_RETRIES}`;
  const due = await sql`
    SELECT id, provider_code, payload FROM courier_webhook_events
     WHERE status = 'failed'
       AND retry_count < ${WEBHOOK_MAX_RETRIES}
     ORDER BY received_at
     LIMIT 50`;
  let recovered = 0;
  let stillFailing = 0;
  for (const event of due) {
    try {
      const { getCourierProvider } = await import('../api/_lib/courier.js');
      const provider = getCourierProvider(String(event.provider_code));
      const normalized = provider.parseWebhook(event.payload);
      await sql`SELECT apply_courier_tracking_event(${normalized.trackingNumber}, ${normalized.externalEventId}, ${normalized.status}, ${normalized.message}, ${normalized.location || null})`;
      await sql`UPDATE courier_webhook_events SET status='processed', processed_at=now(), last_error=NULL WHERE id=${event.id}`;
      recovered += 1;
    } catch (error) {
      stillFailing += 1;
      await sql`UPDATE courier_webhook_events SET retry_count = retry_count + 1, last_error = ${(error instanceof Error ? error.message : 'unknown').slice(0, 500)} WHERE id = ${event.id}`;
    }
  }
  return `courier webhooks: ${due.length} considered, ${recovered} processed, ${stillFailing} still failing`;
}

async function main() {
  console.log(await evaluatePayoutEligibility());
  for (const line of await detectSlaViolations()) console.log(line);
  console.log(await retryCourierWebhooks());
  const { retryEmailDeliveries } = await import('../api/_lib/email.js');
  console.log(await retryEmailDeliveries());
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error('jobs-runner failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  },
);


