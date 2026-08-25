import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from './_lib/db.js';
import { requireAdminPermission } from './_lib/auth.js';
import { recordAudit, recordOrderEvent } from './_lib/audit.js';

const refundStatuses = new Set(['requested','approved','processing','completed','rejected','failed']);
const rmaStatuses = new Set(['requested','approved','return_in_transit','received','inspecting','refunded','replaced','rejected','cancelled']);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const permission = req.method === 'GET' ? 'finance.read' : 'refunds.create';
  const admin = await requireAdminPermission(req, res, permission);
  if (!admin) return;

  try {
    if (req.method === 'GET') {
      const orderId = typeof req.query.orderId === 'string' ? req.query.orderId : null;
      const refunds = orderId
        ? await sql`SELECT r.*, o.order_number FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.order_id=${orderId} ORDER BY r.created_at DESC`
        : await sql`SELECT r.*, o.order_number FROM refunds r JOIN orders o ON o.id=r.order_id ORDER BY r.created_at DESC LIMIT 500`;
      const returns = orderId
        ? await sql`SELECT rr.*, o.order_number FROM return_requests rr JOIN orders o ON o.id=rr.order_id WHERE rr.order_id=${orderId} ORDER BY rr.created_at DESC`
        : await sql`SELECT rr.*, o.order_number FROM return_requests rr JOIN orders o ON o.id=rr.order_id ORDER BY rr.created_at DESC LIMIT 500`;
      return json(res, 200, { refunds, returns });
    }

    if (req.method !== 'POST' && req.method !== 'PATCH') return json(res, 405, { error: 'Method not allowed.' });
    const body = req.body || {};

    if (req.method === 'POST' && body.action === 'refund') {
      if (typeof body.orderId !== 'string' || typeof body.amountKobo !== 'number' || !Number.isSafeInteger(body.amountKobo) || body.amountKobo <= 0) return json(res, 400, { error: 'Order and a positive whole-kobo refund amount are required.' });
      const order = await sql`SELECT id, order_number, total_kobo FROM orders WHERE id=${body.orderId} LIMIT 1`;
      if (!order[0]) return json(res, 404, { error: 'Order not found.' });
      const already = await sql`SELECT COALESCE(SUM(amount_kobo),0)::bigint AS amount FROM refunds WHERE order_id=${body.orderId} AND status IN ('requested','approved','processing','completed')`;
      const remaining = Number(order[0].total_kobo) - Number(already[0]?.amount || 0);
      if (body.amountKobo > remaining) return json(res, 409, { error: `Refund exceeds the remaining refundable amount (${remaining} kobo).` });
      const key = typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim() ? body.idempotencyKey.trim() : `refund:${body.orderId}:${body.amountKobo}:${body.reason || 'unspecified'}`;
      const rows = await sql`
        INSERT INTO refunds(order_id,amount_kobo,reason,status,idempotency_key,requested_by)
        VALUES(${body.orderId},${body.amountKobo},${typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'Customer refund'},'requested',${key},${admin.id})
        ON CONFLICT(idempotency_key) DO NOTHING
        RETURNING id, order_id, amount_kobo, status, idempotency_key, created_at
      `;
      if (!rows[0]) {
        const existing = await sql`SELECT id, order_id, amount_kobo, status, idempotency_key, created_at FROM refunds WHERE idempotency_key=${key} LIMIT 1`;
        return json(res, 200, { refund: existing[0], idempotent: true });
      }
      await recordAudit({ actorUserId: admin.id, action: 'refund.requested', entityType: 'refund', entityId: rows[0].id, afterData: rows[0] });
      await recordOrderEvent({ actorUserId: admin.id, orderId: body.orderId, eventType: 'refund_requested', metadata: { refundId: rows[0].id, amountKobo: body.amountKobo } });
      return json(res, 201, { refund: rows[0] });
    }

    if (req.method === 'POST' && body.action === 'rma') {
      if (typeof body.orderId !== 'string' || typeof body.reason !== 'string' || !body.reason.trim()) return json(res, 400, { error: 'Order and return reason are required.' });
      const rma = `RMA-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
      const rows = await sql`
        INSERT INTO return_requests(rma_number,order_id,fulfillment_id,reason,customer_note,status)
        VALUES(${rma},${body.orderId},${typeof body.fulfillmentId === 'string' ? body.fulfillmentId : null},${body.reason.trim()},${typeof body.customerNote === 'string' ? body.customerNote.trim() : ''},'requested')
        RETURNING *
      `;
      await recordAudit({ actorUserId: admin.id, action: 'rma.created', entityType: 'return_request', entityId: rows[0].id, afterData: rows[0] });
      await recordOrderEvent({ actorUserId: admin.id, orderId: body.orderId, eventType: 'return_requested', metadata: { returnRequestId: rows[0].id, rmaNumber: rma } });
      return json(res, 201, { returnRequest: rows[0] });
    }

    if (req.method === 'PATCH' && typeof body.refundId === 'string') {
      if (typeof body.status !== 'string' || !refundStatuses.has(body.status)) return json(res, 400, { error: 'Invalid refund status.' });
      const existing = await sql`SELECT * FROM refunds WHERE id=${body.refundId} LIMIT 1`;
      if (!existing[0]) return json(res, 404, { error: 'Refund not found.' });

      if (body.status === 'completed') {
        const payment = await sql`
          SELECT id FROM payment_transactions
          WHERE order_id=${existing[0].order_id}
            AND status IN ('confirmed','partially_refunded')
          ORDER BY confirmed_at DESC NULLS LAST, created_at DESC
          LIMIT 1
        `;
        if (!payment[0]) return json(res, 409, { error: 'Refund cannot complete until a confirmed payment transaction is linked.' });

        const rows = await sql`
          UPDATE refunds
             SET status='completed', payment_transaction_id=${payment[0].id}, approved_by=${admin.id}, processed_at=now()
           WHERE id=${body.refundId} AND status <> 'completed'
           RETURNING *
        `;
        if (!rows[0]) {
          const current = await sql`SELECT * FROM refunds WHERE id=${body.refundId} LIMIT 1`;
          return json(res, 200, { refund: current[0], idempotent: true });
        }
        await sql`SELECT post_refund_ledger(${body.refundId}, ${admin.id})`;
        await recordAudit({ actorUserId: admin.id, action: 'refund.status_update', entityType: 'refund', entityId: body.refundId, beforeData: existing[0], afterData: rows[0] });
        await recordOrderEvent({ actorUserId: admin.id, orderId: rows[0].order_id, eventType: 'refund_status_changed', metadata: { refundId: body.refundId, status: 'completed', ledgerPosted: true } });
        return json(res, 200, { refund: rows[0], ledgerPosted: true });
      }

      const rows = await sql`
        UPDATE refunds
           SET status=${body.status},
               approved_by=CASE WHEN ${body.status} IN ('approved','processing') THEN ${admin.id} ELSE approved_by END
         WHERE id=${body.refundId}
         RETURNING *
      `;
      await recordAudit({ actorUserId: admin.id, action: 'refund.status_update', entityType: 'refund', entityId: body.refundId, beforeData: existing[0], afterData: rows[0] });
      await recordOrderEvent({ actorUserId: admin.id, orderId: rows[0].order_id, eventType: 'refund_status_changed', metadata: { refundId: body.refundId, status: body.status } });
      return json(res, 200, { refund: rows[0] });
    }

    if (req.method === 'PATCH' && typeof body.returnRequestId === 'string') {
      if (typeof body.status !== 'string' || !rmaStatuses.has(body.status)) return json(res, 400, { error: 'Return request and valid status are required.' });
      const existing = await sql`SELECT * FROM return_requests WHERE id=${body.returnRequestId} LIMIT 1`;
      if (!existing[0]) return json(res, 404, { error: 'Return request not found.' });
      const rows = await sql`UPDATE return_requests SET status=${body.status}, return_tracking_number=COALESCE(${body.returnTrackingNumber || null},return_tracking_number), inspection_result=COALESCE(${body.inspectionResult || null},inspection_result), updated_at=now() WHERE id=${body.returnRequestId} RETURNING *`;
      await recordAudit({ actorUserId: admin.id, action: 'rma.status_update', entityType: 'return_request', entityId: body.returnRequestId, beforeData: existing[0], afterData: rows[0] });
      await recordOrderEvent({ actorUserId: admin.id, orderId: rows[0].order_id, eventType: 'return_status_changed', metadata: { returnRequestId: body.returnRequestId, status: body.status } });
      return json(res, 200, { returnRequest: rows[0] });
    }

    return json(res, 400, { error: 'Unsupported refund operation.' });
  } catch (error: any) {
    const message = String(error?.message || '');
    if (message.includes('duplicate key')) return json(res, 409, { error: 'This operation already exists.' });
    if (message.includes('REFUND_NOT_COMPLETED') || message.includes('REFUND_PAYMENT_NOT_LINKED')) return json(res, 409, { error: 'Refund ledger precondition failed.' });
    return json(res, 500, { error: 'Refund operation could not be completed.' });
  }
}
