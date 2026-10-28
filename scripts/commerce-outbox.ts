import { sql } from './db.js';
import { notifyUser } from './notifications.js';

export const commerceWorkerEnabled = () => process.env.COMMERCE_OUTBOX_ENABLED === 'true';

export function notificationCopy(event: string, order: { order_number: unknown; listing_title: unknown; quantity: unknown }) {
  const n=String(order.order_number), product=String(order.listing_title).slice(0,130);
  switch(event){
    case 'requested': return {title:'New purchase request',body:`Order #${n}: a buyer wants ${order.quantity} x ${product}. Please confirm availability.`};
    case 'accepted': return {title:'Seller confirmed availability',body:`Order #${n}: ${product} is available. Do not pay yet; community checkout is not enabled.`};
    case 'declined': return {title:'Request declined',body:`Order #${n}: the product is unavailable. You have not been charged.`};
    case 'expired': return {title:'Request expired',body:`Order #${n}: the seller did not confirm availability. You have not been charged.`};
    case 'cancelled': return {title:'Buyer cancelled',body:`Order #${n} was cancelled.`};
    case 'reminder_20m':
    case 'reminder_2h': return {title:'Confirm a buyer request',body:`Order #${n}: please confirm whether ${product} is available.`};
    default: return null;
  }
}

export async function tickCommerceOutbox() {
  const totals = {delivered:0,failed:0};
  if (!commerceWorkerEnabled()) return totals;
  await sql`UPDATE marketplace_purchase_requests SET status='expired',updated_at=now()
    WHERE status='awaiting_seller' AND seller_response_deadline<=now()`;
  await sql`INSERT INTO commerce_outbox(event_key,event_type,request_id,recipient_id)
    SELECT 'marketplace:'||o.id::text||':reminder_20m','reminder_20m',o.id,o.seller_id
    FROM marketplace_purchase_requests o WHERE o.status='awaiting_seller'
      AND o.created_at<=now()-interval '20 minutes' AND o.seller_response_deadline>now()
    ON CONFLICT(event_key) DO NOTHING`;
  await sql`INSERT INTO commerce_outbox(event_key,event_type,request_id,recipient_id)
    SELECT 'marketplace:'||o.id::text||':reminder_2h','reminder_2h',o.id,o.seller_id
    FROM marketplace_purchase_requests o WHERE o.status='awaiting_seller'
      AND o.created_at<=now()-interval '2 hours' AND o.seller_response_deadline>now()
    ON CONFLICT(event_key) DO NOTHING`;
  await sql`UPDATE commerce_outbox SET status='queued',locked_at=NULL,lock_token=NULL
    WHERE status='processing' AND locked_at<now()-interval '15 minutes'`;
  // One statement owns both claim and lease, even with concurrent workers.
  const jobs = await sql`
    WITH pick AS (
      SELECT id FROM commerce_outbox WHERE status='queued' AND next_run_at<=now()
      ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 10
    )
    UPDATE commerce_outbox o SET status='processing',attempts=o.attempts+1,
      locked_at=now(),lock_token=gen_random_uuid()
    FROM pick WHERE o.id=pick.id
    RETURNING o.id,o.request_id,o.recipient_id,o.event_type,o.lock_token,o.attempts,o.max_attempts`;
  for (const job of jobs) {
    try {
      const rows = await sql`SELECT o.order_number,o.listing_title,o.quantity,u.email,u.name
        FROM marketplace_purchase_requests o JOIN users u ON u.id=${job.recipient_id}
        WHERE o.id=${job.request_id} LIMIT 1`;
      if (!rows.length) throw new Error('Notification recipient missing');
      const msg=notificationCopy(String(job.event_type),rows[0]);
      if (!msg) throw new Error('Unknown notification event');
      const safe=msg.body.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      await notifyUser({
        userId:String(job.recipient_id),email:String(rows[0].email),firstName:String(rows[0].name),
        eventType:'marketplace.'+job.event_type+'.'+job.request_id,
        title:msg.title,body:msg.body,subject:msg.title,text:msg.body,html:'<p>'+safe+'</p>'
      });
      await sql`UPDATE commerce_outbox SET status='completed',completed_at=now(),lock_token=NULL,locked_at=NULL
        WHERE id=${job.id} AND lock_token=${job.lock_token}`;
      totals.delivered++;
    } catch(e) {
      const attempts=Number(job.attempts);
      const dead=attempts>=Number(job.max_attempts);
      const delay=Math.min(1800,30*Math.pow(2,Math.max(0,attempts-1)));
      await sql`UPDATE commerce_outbox SET status=${dead?'dead':'queued'},
        next_run_at=now()+make_interval(secs=>${delay}),
        last_error=${e instanceof Error?e.message.slice(0,500):'Notification failed'},
        locked_at=NULL,lock_token=NULL
        WHERE id=${job.id} AND lock_token=${job.lock_token}`;
      totals.failed++;
    }
  }
  return totals;
}
