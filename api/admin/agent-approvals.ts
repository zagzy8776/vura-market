import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';
import { requireAdmin, requireAdminPermission } from '../_lib/auth.js';
import { applySecurityHeaders } from '../_lib/http.js';
import { json, sql } from '../_lib/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applySecurityHeaders(res);
  if (req.method !== 'GET' && req.method !== 'PATCH') return json(res, 405, { error: 'Method not allowed.' });
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const ok = await requireAdminPermission(req, res, 'dashboard.read');
  if (!ok) return;
  const requestId = randomUUID();
  res.setHeader('X-Request-ID', requestId);

  if (req.method === 'GET') {
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
    if (!['pending', 'approved', 'rejected', 'expired'].includes(status)) return json(res, 400, { error: 'Invalid approval status.', requestId });
    const rows = await sql`
      SELECT a.id, a.run_id, a.agent_id, a.tool_name, a.risk, a.input, a.status, a.requested_at, a.decided_at, a.decided_by, a.decision_note
      FROM agent_approvals a WHERE a.status = ${status} ORDER BY a.requested_at DESC LIMIT 100`;
    return json(res, 200, { approvals: rows, requestId });
  }

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
  await sql`INSERT INTO agent_events (id, run_id, event_type, tool_name, risk, output) VALUES (${randomUUID()}, ${updated[0].run_id}, ${`approval.${decision}`}, ${updated[0].tool_name}, ${updated[0].risk}, ${JSON.stringify({ decidedBy: admin.id, note })}::jsonb)`;
  return json(res, 200, { ok: true, approval: updated[0], requestId });
}
