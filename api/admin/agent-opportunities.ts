import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applySecurityHeaders } from '../_lib/http.js';
import { json } from '../_lib/db.js';
import { requireAdminPermission } from '../_lib/auth.js';
import { listOpportunities, updateOpportunityStatus } from '../_lib/agents/opportunities.js';
import type { OpportunityStatus } from '../_lib/agents/opportunities.js';

const statuses = new Set<OpportunityStatus>(['new', 'watching', 'investigating', 'approved', 'dismissed']);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applySecurityHeaders(res);
  const admin = await requireAdminPermission(req, res, 'dashboard.read');
  if (!admin) return;

  if (req.method === 'GET') {
    const status = typeof req.query.status === 'string' && statuses.has(req.query.status as OpportunityStatus)
      ? req.query.status as OpportunityStatus : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category.trim().slice(0, 160) : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
    if (!Number.isFinite(limit)) return json(res, 400, { error: 'Invalid limit.' });
    return json(res, 200, { opportunities: await listOpportunities({ status, category, limit }) });
  }

  if (req.method !== 'PATCH') return json(res, 405, { error: 'Method not allowed.' });
  const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const status = typeof body.status === 'string' ? body.status as OpportunityStatus : null;
  if (!id || !status || !statuses.has(status)) return json(res, 400, { error: 'Valid id and status are required.' });

  const opportunity = await updateOpportunityStatus(id, status);
  return opportunity ? json(res, 200, { opportunity }) : json(res, 404, { error: 'Opportunity not found.' });
}
