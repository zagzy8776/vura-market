import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { recordAudit } from '../_lib/audit.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  try {
    if (req.method === 'GET') {
      return json(res, 200, {
        suppliers: await sql`SELECT id, name, location, phone, notes, reliability_score, created_at, updated_at FROM suppliers ORDER BY updated_at DESC`,
      });
    }

    if (req.method === 'POST') {
      const { name, location, phone, notes } = req.body || {};
      if (typeof name !== 'string' || name.trim().length < 2) return json(res, 400, { error: 'Supplier name is required.' });
      const rows = await sql`INSERT INTO suppliers (name, location, phone, notes) VALUES (${name.trim()}, ${location || null}, ${phone || null}, ${notes || ''}) RETURNING id, name, location, phone, notes, reliability_score`;
      await recordAudit({ actorUserId: admin.id, action: 'supplier.create', entityType: 'supplier', entityId: rows[0].id, afterData: rows[0] });
      return json(res, 201, { supplier: rows[0] });
    }

    if (req.method === 'PATCH') {
      const { supplierId, name, location, phone, notes, reliabilityScore } = req.body || {};
      if (typeof supplierId !== 'string') return json(res, 400, { error: 'Supplier is required.' });
      const before = await sql`SELECT id, name, location, phone, notes, reliability_score FROM suppliers WHERE id = ${supplierId} LIMIT 1`;
      if (!before[0]) return json(res, 404, { error: 'Supplier not found.' });
      const score = reliabilityScore == null || reliabilityScore === '' ? null : Number(reliabilityScore);
      if (score != null && (!Number.isFinite(score) || score < 0 || score > 5)) return json(res, 400, { error: 'Reliability score must be between 0 and 5.' });
      const rows = await sql`UPDATE suppliers SET name = COALESCE(${typeof name === 'string' && name.trim() ? name.trim() : null}, name), location = ${location === undefined ? before[0].location : location || null}, phone = ${phone === undefined ? before[0].phone : phone || null}, notes = ${notes === undefined ? before[0].notes : notes || ''}, reliability_score = COALESCE(${score}, reliability_score), updated_at = now() WHERE id = ${supplierId} RETURNING id, name, location, phone, notes, reliability_score, updated_at`;
      await recordAudit({ actorUserId: admin.id, action: 'supplier.update', entityType: 'supplier', entityId: supplierId, beforeData: before[0], afterData: rows[0] });
      return json(res, 200, { supplier: rows[0] });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch {
    return json(res, 500, { error: 'We could not save the supplier.' });
  }
}
