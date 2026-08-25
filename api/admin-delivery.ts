import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from './_lib/db.js';
import { requireAdminPermission } from './_lib/auth.js';
import { recordAudit, recordOrderEvent } from './_lib/audit.js';

const statuses = new Set(['pending','preparing','dispatched','in_transit','delivered','failed','cancelled']);

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

    if (req.method !== 'POST' && req.method !== 'PATCH') return json(res, 405, { error: 'Method not allowed.' });
    const body = req.body || {};

    if (req.method === 'POST') {
      if (typeof body.orderId !== 'string') return json(res, 400, { error: 'Order is required.' });
      const address = typeof body.deliveryAddress === 'string' ? body.deliveryAddress.trim() : '';
      if (!address) return json(res, 400, { error: 'Delivery address is required.' });
      const rows = await sql`SELECT id, supplier_id, delivery_address, delivery_city FROM orders WHERE id=${body.orderId} LIMIT 1`;
      if (!rows[0]) return json(res, 404, { error: 'Order not found.' });
      const fulfillment = await sql`
        SELECT create_fulfillment(${body.orderId}, ${typeof body.supplierId === 'string' ? body.supplierId : rows[0].supplier_id}, ${body.courierName || null}, ${body.trackingNumber || null}, ${address}, ${body.deliveryCity || rows[0].delivery_city || null}) AS id
      `;
      const id = fulfillment[0].id;
      await recordAudit({ actorUserId: admin.id, action: 'fulfillment.create', entityType: 'fulfillment', entityId: id, afterData: { orderId: body.orderId, supplierId: body.supplierId || rows[0].supplier_id, courierName: body.courierName || null, trackingNumber: body.trackingNumber || null } });
      await recordOrderEvent({ actorUserId: admin.id, orderId: body.orderId, eventType: 'fulfillment_created', toStatus: 'pending', metadata: { fulfillmentId: id } });
      return json(res, 201, { fulfillmentId: id });
    }

    if (typeof body.fulfillmentId !== 'string') return json(res, 400, { error: 'Fulfillment is required.' });
    if (typeof body.status !== 'string' || !statuses.has(body.status)) return json(res, 400, { error: 'Invalid fulfillment status.' });
    const existing = await sql`SELECT id, order_id, status, tracking_number, courier_name FROM order_fulfillments WHERE id=${body.fulfillmentId} LIMIT 1`;
    if (!existing[0]) return json(res, 404, { error: 'Fulfillment not found.' });
    const event = await sql`SELECT update_fulfillment_status(${body.fulfillmentId}, ${body.status}, ${typeof body.message === 'string' && body.message.trim() ? body.message.trim() : `Fulfillment status changed to ${body.status}.`}, ${body.location || null}, 'admin', ${body.externalEventId || null}) AS id`;
    if (body.trackingNumber !== undefined || body.courierName !== undefined) {
      await sql`UPDATE order_fulfillments SET tracking_number=COALESCE(${body.trackingNumber || null},tracking_number), courier_name=COALESCE(${body.courierName || null},courier_name), updated_at=now() WHERE id=${body.fulfillmentId}`;
    }
    await recordAudit({ actorUserId: admin.id, action: 'fulfillment.status_update', entityType: 'fulfillment', entityId: body.fulfillmentId, beforeData: existing[0], afterData: { status: body.status, eventId: event[0]?.id || null } });
    await recordOrderEvent({ actorUserId: admin.id, orderId: existing[0].order_id, eventType: 'fulfillment_status_changed', toStatus: body.status, metadata: { fulfillmentId: body.fulfillmentId } });
    return json(res, 200, { fulfillmentId: body.fulfillmentId, eventId: event[0]?.id || null });
  } catch (error: any) {
    const code = String(error?.message || '');
    if (code.includes('ORDER_NOT_FOUND') || code.includes('FULFILLMENT_NOT_FOUND')) return json(res, 404, { error: 'Resource not found.' });
    if (code.includes('INVALID_FULFILLMENT_STATUS')) return json(res, 400, { error: 'Invalid fulfillment status.' });
    return json(res, 500, { error: 'Delivery operation could not be completed.' });
  }
}
