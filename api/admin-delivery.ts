import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from './_lib/db.js';
import { requireAdminPermission } from './_lib/auth.js';
import { recordAudit, recordOrderEvent } from './_lib/audit.js';
import { applySecurityHeaders, rejectUnsupportedMethod } from './_lib/http.js';

const statuses = new Set(['pending','preparing','dispatched','in_transit','delivered','failed','cancelled']);
const MAX_TEXT = 500;
const text = (value: unknown, max = MAX_TEXT) => typeof value === 'string' ? value.trim().slice(0, max) : '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applySecurityHeaders(res);
  const admin = await requireAdminPermission(req, res, req.method === 'GET' ? 'orders.read' : 'orders.write');
  if (!admin) return;
  try {
    if (req.method === 'GET') {
      const orderId = typeof req.query.orderId === 'string' ? req.query.orderId : null;
      const rows = orderId
        ? await sql`SELECT f.*, s.name AS supplier_name FROM order_fulfillments f LEFT JOIN suppliers s ON s.id=f.supplier_id WHERE f.order_id=${orderId} ORDER BY f.created_at DESC`
        : await sql`SELECT f.*, s.name AS supplier_name, o.order_number FROM order_fulfillments f LEFT JOIN suppliers s ON s.id=f.supplier_id JOIN orders o ON o.id=f.order_id ORDER BY f.created_at DESC LIMIT 500`;
      const ids = rows.map((r: any) => r.id);
      const events = ids.length ? await sql`SELECT * FROM delivery_events WHERE fulfillment_id = ANY(${ids}) ORDER BY created_at ASC` : [];
      return json(res, 200, { fulfillments: rows, events });
    }

    if (req.method !== 'POST' && req.method !== 'PATCH') return rejectUnsupportedMethod(res, ['GET', 'POST', 'PATCH']);
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};

    if (req.method === 'POST') {
      const orderId = text(body.orderId, 100);
      const address = text(body.deliveryAddress, 1000);
      if (!orderId) return json(res, 400, { error: 'Order is required.' });
      if (!address) return json(res, 400, { error: 'Delivery address is required.' });
      const rows = await sql`SELECT id, supplier_id, delivery_address, delivery_city FROM orders WHERE id=${orderId} LIMIT 1`;
      if (!rows[0]) return json(res, 404, { error: 'Order not found.' });
      const supplierId = text(body.supplierId, 100);
      const fulfillment = await sql`
        SELECT create_fulfillment(${orderId}, ${supplierId || rows[0].supplier_id || null}, ${text(body.courierName) || null}, ${text(body.trackingNumber) || null}, ${address}, ${text(body.deliveryCity, 200) || rows[0].delivery_city || null}) AS id
      `;
      const id = fulfillment[0].id;
      await recordAudit({ actorUserId: admin.id, action: 'fulfillment.create', entityType: 'fulfillment', entityId: id, afterData: { orderId, supplierId: supplierId || rows[0].supplier_id, courierName: text(body.courierName), trackingNumber: text(body.trackingNumber) } });
      await recordOrderEvent({ actorUserId: admin.id, orderId, eventType: 'fulfillment_created', toStatus: 'pending', metadata: { fulfillmentId: id } });
      return json(res, 201, { fulfillmentId: id });
    }

    const fulfillmentId = text(body.fulfillmentId, 100);
    const status = text(body.status, 50);
    if (!fulfillmentId) return json(res, 400, { error: 'Fulfillment is required.' });
    if (!statuses.has(status)) return json(res, 400, { error: 'Invalid fulfillment status.' });
    const existing = await sql`SELECT id, order_id, status, tracking_number, courier_name FROM order_fulfillments WHERE id=${fulfillmentId} LIMIT 1`;
    if (!existing[0]) return json(res, 404, { error: 'Fulfillment not found.' });
    const event = await sql`SELECT update_fulfillment_status(${fulfillmentId}, ${status}, ${text(body.message) || `Fulfillment status changed to ${status}.`}, ${text(body.location, 200) || null}, 'admin', ${text(body.externalEventId, 200) || null}) AS id`;
    if (body.trackingNumber !== undefined || body.courierName !== undefined) {
      const tracking = text(body.trackingNumber, 200);
      const courier = text(body.courierName, 200);
      await sql`UPDATE order_fulfillments SET tracking_number=COALESCE(${tracking || null},tracking_number), courier_name=COALESCE(${courier || null},courier_name), updated_at=now() WHERE id=${fulfillmentId}`;
    }
    await recordAudit({ actorUserId: admin.id, action: 'fulfillment.status_update', entityType: 'fulfillment', entityId: fulfillmentId, beforeData: existing[0], afterData: { status, eventId: event[0]?.id || null } });
    await recordOrderEvent({ actorUserId: admin.id, orderId: existing[0].order_id, eventType: 'fulfillment_status_changed', toStatus: status, metadata: { fulfillmentId } });
    return json(res, 200, { fulfillmentId, eventId: event[0]?.id || null });
  } catch (error: any) {
    const code = String(error?.message || '');
    if (code.includes('ORDER_NOT_FOUND') || code.includes('FULFILLMENT_NOT_FOUND')) return json(res, 404, { error: 'Resource not found.' });
    if (code.includes('INVALID_FULFILLMENT_STATUS')) return json(res, 400, { error: 'Invalid fulfillment status.' });
    return json(res, 500, { error: 'Delivery operation could not be completed.' });
  }
}
