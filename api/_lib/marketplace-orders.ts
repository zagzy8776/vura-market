import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from './db.js';
import { requireUser } from './auth.js';
import { sendOneSignalPush, appBaseUrl } from './onesignal.js';
import { sendTransactionalEmail } from './email.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE = /^\+?[0-9]{10,15}$/;
const clip = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : '';

function errorCode(e: unknown): { status: number; error: string } {
  const message = e instanceof Error ? e.message : '';
  if (message.includes('LISTING_UNAVAILABLE')) return { status: 409, error: 'This product is not available in the requested quantity.' };
  if (message.includes('CANNOT_BUY_OWN_LISTING')) return { status: 400, error: 'You cannot order from your own listing.' };
  if (message.includes('INVALID_QUANTITY') || message.includes('INVALID_DESTINATION')) return { status: 400, error: 'Check the quantity, phone number and delivery area.' };
  if (message.includes('ORDER_ALREADY_PROCESSED')) return { status: 409, error: 'This request has already been answered.' };
  if (message.includes('ORDER_NOT_FOUND')) return { status: 404, error: 'This order request was not found.' };
  return { status: 503, error: 'Community order requests are not ready yet. Please try again later.' };
}

async function notifyParty(userId: string, type: string, title: string, message: string, orderId: string, path: string) {
  // A unique notification type per request/action makes retries idempotent.
  const inserted = await sql`
    INSERT INTO notifications (user_id, order_id, type, title, body)
    VALUES (${userId}, NULL, ${type + '.' + orderId}, ${title}, ${message})
    ON CONFLICT DO NOTHING RETURNING id
  `;
  if (!inserted.length) return;
  const url = appBaseUrl() ? appBaseUrl() + path : undefined;
  await sendOneSignalPush({
    externalUserIds: [userId], title, body: message, url,
    data: { side: 'customer', eventType: type, requestId: orderId },
  }).catch(() => undefined);
  const rows = await sql`SELECT email FROM users WHERE id=${userId} LIMIT 1`;
  if (rows[0]?.email) {
    await sendTransactionalEmail({
      userId, eventType: type + '.' + orderId, recipient: String(rows[0].email),
      subject: title, text: message + (url ? '\n' + url : ''),
      html: '<p>' + message.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;') + '</p>',
    }).catch(() => undefined);
  }
}

export async function marketplaceOrders(req: VercelRequest, res: VercelResponse, body: Record<string, unknown> = {}) {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    if (req.method === 'GET') {
      const side = clip(req.query.side, 20) === 'seller' ? 'seller' : 'buyer';
      const id = clip(req.query.id, 60);
      if (id && !UUID.test(id)) return json(res, 400, { error: 'Invalid order request.' });
      const rawPage = Number(req.query.page);
      const page = Number.isInteger(rawPage) && rawPage > 0 ? Math.min(10000, rawPage) : 1;
      // Expiration is enforced in the database on read and on seller response.
      await sql`
        WITH expired AS (
          UPDATE marketplace_purchase_requests
          SET status='expired',updated_at=now()
          WHERE status='awaiting_seller' AND seller_response_deadline <= now()
            AND (${user.id}::uuid=buyer_id OR ${user.id}::uuid=seller_id)
          RETURNING id
        )
        INSERT INTO marketplace_order_events(request_id,actor_id,event_type,message)
        SELECT id,NULL,'expired','Seller confirmation window expired.' FROM expired
      `;
      const rows = await sql`
        SELECT o.id,o.order_number,o.listing_id,o.listing_title,o.quantity,o.unit_price_kobo,
          o.subtotal_kobo,o.buyer_phone,o.destination_state_code,o.destination_city,o.status,
          o.created_at,o.responded_at,o.seller_response_deadline,
          l.images, s.shop_name, b.name AS buyer_name
        FROM marketplace_purchase_requests o
        JOIN marketplace_listings l ON l.id=o.listing_id
        JOIN marketplace_sellers s ON s.user_id=o.seller_id
        JOIN users b ON b.id=o.buyer_id
        WHERE (${side}='seller' AND o.seller_id=${user.id}::uuid OR
               ${side}='buyer' AND o.buyer_id=${user.id}::uuid)
          AND (${id || null}::uuid IS NULL OR o.id=${id || null}::uuid)
        ORDER BY o.created_at DESC LIMIT ${id ? 1 : 30} OFFSET ${(page-1)*30}
      `;
      const events = id && rows.length ? await sql`
        SELECT event_type,message,created_at FROM marketplace_order_events
        WHERE request_id=${id}::uuid ORDER BY created_at ASC
      ` : [];
      return json(res, 200, { orders: rows, events, page });
    }
    if (req.method === 'POST') {
      const listingId = clip(body.listingId, 60);
      const requestId = clip(body.requestId, 60);
      const quantity = Number(body.quantity);
      const phone = clip(body.phone, 20).replace(/[()\s-]/g, '');
      const stateCode = clip(body.stateCode, 3).toUpperCase();
      const city = clip(body.city, 100);
      if (!UUID.test(listingId) || !UUID.test(requestId) ||
          !Number.isInteger(quantity) || quantity < 1 || quantity > 1000 ||
          !PHONE.test(phone) || stateCode.length !== 2 || city.length < 2)
        return json(res, 400, { error: 'Provide a valid product, quantity, phone and delivery area.' });
      const results = await sql`
        SELECT * FROM marketplace_submit_request(
          ${listingId}::uuid,${user.id}::uuid,${quantity},${phone},
          ${stateCode},${city},${requestId}::uuid
        )
      `;
      const order = results[0];
      if (!order) return json(res, 503, { error: 'Could not create this request.' });
      // The outbox trigger owns notification delivery when the worker is enabled.
      if (process.env.COMMERCE_OUTBOX_ENABLED !== 'true') {
      try {
        await notifyParty(String(order.seller_id), 'marketplace.order.request',
          'A customer wants to buy your product',
          'A buyer wants ' + order.quantity + ' × ' + order.listing_title + '. Open My Shop to confirm availability.',
          String(order.id), '/sell/orders');
      } catch { /* The durable order still exists and is visible in My Shop. */ }
      }
      return json(res, 201, { order });
    }
    if (req.method === 'PATCH') {
      const id = clip(body.id, 60);
      const action = clip(body.action, 20);
      if (!UUID.test(id)) return json(res, 400, { error: 'Invalid order request.' });
      if (action === 'cancel') {
        const cancelled = await sql`
          UPDATE marketplace_purchase_requests SET status='cancelled',updated_at=now()
          WHERE id=${id}::uuid AND buyer_id=${user.id}::uuid
            AND status IN ('awaiting_seller','seller_accepted')
          RETURNING *
        `;
        if (!cancelled.length) return json(res, 409, { error: 'This request cannot be cancelled here.' });
        await sql`
          INSERT INTO marketplace_order_events(request_id,actor_id,event_type,message)
          VALUES (${id}::uuid,${user.id}::uuid,'cancelled','Buyer cancelled the request.')
        `;
        if (process.env.COMMERCE_OUTBOX_ENABLED !== 'true') {
        try { await notifyParty(String(cancelled[0].seller_id), 'marketplace.order.cancelled',
          'Buyer cancelled the request','Order #' + cancelled[0].order_number + ' was cancelled.', id,'/sell/orders'); }
        catch { /* no change to order status */ }
        }
        return json(res, 200, { order: cancelled[0] });
      }
      if (!['accept','decline','unavailable'].includes(action))
        return json(res, 400, { error: 'Choose accept, decline or unavailable.' });
      const rows = await sql`
        SELECT * FROM marketplace_seller_decide(${id}::uuid,${user.id}::uuid,${action})
      `;
      const order = rows[0];
      if (!order) return json(res, 404, { error: 'Request not found.' });
      if (process.env.COMMERCE_OUTBOX_ENABLED !== 'true') {
      const approved = order.status === 'seller_accepted';
      try { await notifyParty(String(order.buyer_id),
        approved ? 'marketplace.order.accepted' : 'marketplace.order.closed',
        approved ? 'Seller confirmed your product is available' : 'Your purchase request was not accepted',
        approved ? 'The seller confirmed ' + order.listing_title + ' is available. No payment is required yet; secure payment is not enabled for community orders.'
                 : 'Order #' + order.order_number + ' cannot proceed. You have not been charged.',
        id, '/market-orders'); } catch { /* Order state remains recorded. */ }
      }
      return json(res, 200, { order });
    }
    return json(res, 405, { error: 'Method not allowed.' });
  } catch (e) {
    const error = errorCode(e);
    return json(res, error.status, { error: error.error });
  }
}
