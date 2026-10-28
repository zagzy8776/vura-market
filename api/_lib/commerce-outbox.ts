import { randomUUID } from 'node:crypto';
import { sql } from './db.js';
import { notifyUser } from './notifications.js';

export const commerceWorkerEnabled = () => process.env.COMMERCE_OUTBOX_ENABLED === 'true';

export async function scheduleCommerceEvents() {
  // Updating status fires the transactional outbox trigger.
  await sql`UPDATE marketplace_purchase_requests SET status='expired',updated_at=now()
    WHERE status='awaiting_seller' AND seller_response_deadline <= now()`;
  await sql`
    INSERT INTO commerce_outbox(event_key,event_type,request_id,recipient_id)
    SELECT 'marketplace:'||o.id::text||':reminder_20m','reminder_20m',o.id,o.seller_id
    FROM marketplace_purchase_requests o
    WHERE o.status='awaiting_seller'
      AND o.created_at <= now() - interval '20 minutes'
      AND o.seller_response_deadline > now()
    ON CONFLICT(event_key) DO NOTHING`;
  await sql`
    INSERT INTO commerce_outbox(event_key,event_type,request_id,recipient_id)
    SELECT 'marketplace:'||o.id::text||':reminder_2h','reminder_2h',o.id,o.seller_id
    FROM marketplace_purchase_requests o
    WHERE o.status='awaiting_seller'
      AND o.created_at <= now() - interval '2 hours'
      AND o.seller_response_deadline > now()
    ON CONFLICT(event_key) DO NOTHING`;
}

export async function recoverCommerceLeases() {
  const rows = await sql`UPDATE commerce_outbox SET status='queued',
      lock_token=NULL,locked_at=NULL,next_run_at=now(),
      last_error='Recovered stale worker lease'
    WHERE status='processing' AND locked_at < now() - interval '15 minutes'
    RETURNING id`;
  return rows.length;
}

export async function claimCommerceBatch(size = 12) {
  const count = Math.max(1, Math.min(12, Math.trunc(size)));
  const token = randomUUID();
  return sql`
    WITH picked AS (
      SELECT id FROM commerce_outbox
      WHERE status='queued' AND next_run_at <= now()
      ORDER BY next_run_at,id
      FOR UPDATE SKIP LOCKED
      LIMIT ${count}
    )
    UPDATE commerce_outbox o SET status='processing',locked_at=now(),
      lock_token=${token}::uuid,attempts=o.attempts+1
    FROM picked WHERE picked.id=o.id
    RETURNING o.id,o.event_type,o.request_id,o.recipient_id,
      o.attempts,o.max_attempts,o.lock_token`;
}

export function notificationCopy(event: string, order: {
  order_number: unknown; listing_title: unknown; quantity: unknown;
}) {
  const n = String(order.order_number), product = String(order.listing_title).slice(0, 130);
  switch (event) {
    case 'requested':
      return { title:'New purchase request', body:`Order #${n}: a buyer wants ${order.quantity} × ${product}. Please confirm availability.` };
    case 'accepted':
      return { title:'Seller confirmed availability', body:`Order #${n}: ${product} is available. Do not pay yet; community checkout is not enabled.` };
    case 'declined':
      return { title:'Seller declined your request', body:`Order #${n}: the seller cannot fulfill your request. You have not been charged.` };
    case 'expired':
      return { title:'Confirmation window expired', body:`Order #${n}: seller confirmation expired. You have not been charged.` };
    case 'cancelled':
      return { title:'Buyer cancelled a request', body:`Order #${n} was cancelled by the buyer.` };
    case 'reminder_20m':
      return { title:'Respond to your customer', body:`Order #${n}: a buyer is waiting for you to confirm ${product}.` };
    case 'reminder_2h':
      return { title:'Customer request still waiting', body:`Order #${n}: confirm whether ${product} is available before expiry.` };
    default: return null;
  }
}

export async function deliverCommerceEvent(job: {id: unknown; event_type: unknown; request_id: unknown; recipient_id: unknown}) {
  const rows = await sql`
    SELECT o.order_number,o.listing_title,o.quantity,u.email,u.name
    FROM marketplace_purchase_requests o
    JOIN users u ON u.id=${String(job.recipient_id)}::uuid
    WHERE o.id=${String(job.request_id)}::uuid LIMIT 1`;
  if (!rows[0]) throw new Error('Missing order or recipient');
  const event = String(job.event_type);
  const message = notificationCopy(event, rows[0]);
  if (!message) throw new Error('Unsupported commerce event');
  // The notification id incorporates order and event and is idempotent in Postgres.
  const type = 'marketplace.' + event + '.' + String(job.request_id);
  await notifyUser({
    userId:String(job.recipient_id),email:String(rows[0].email),firstName:String(rows[0].name),
    eventType:type,title:message.title,body:message.body,
    subject:message.title + ' · Order #' + rows[0].order_number,
    text:message.body,
    html:'<p>' + message.body.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;') + '</p>',
  });
}

export async function tickCommerceOutbox() {
  const result = { delivered:0, failed:0, dead:0 };
  if (!commerceWorkerEnabled()) return result;
  await recoverCommerceLeases();
  await scheduleCommerceEvents();
  const jobs = await claimCommerceBatch();
  for (const job of jobs) {
    const id = String(job.id), token = String(job.lock_token);
    try {
      await deliverCommerceEvent(job);
      await sql`UPDATE commerce_outbox SET status='completed',completed_at=now(),
        lock_token=NULL,locked_at=NULL,last_error=NULL
        WHERE id=${id}::bigint AND lock_token=${token}::uuid AND status='processing'`;
      result.delivered++;
    } catch(e) {
      const message = e instanceof Error ? e.message.slice(0,800) : 'Delivery failed';
      const attempts = Number(job.attempts), dead = attempts >= Number(job.max_attempts);
      const delay = Math.min(1800,20*Math.pow(2,Math.max(0,attempts-1)));
      await sql`UPDATE commerce_outbox SET status=${dead?'dead':'queued'},
        next_run_at=now()+make_interval(secs => ${delay}),last_error=${message},
        lock_token=NULL,locked_at=NULL
        WHERE id=${id}::bigint AND lock_token=${token}::uuid AND status='processing'`;
      result.failed++;
      if (dead) result.dead++;
    }
  }
  return result;
}
