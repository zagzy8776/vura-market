import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applySecurityHeaders } from '../_lib/http.js';
import { json } from '../_lib/db.js';
import { requireAdminPermission } from '../_lib/auth.js';
import { listAgentNotifications } from '../_lib/agents/notifications.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applySecurityHeaders(res);
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  const admin = await requireAdminPermission(req, res, 'dashboard.read');
  if (!admin) return;
  const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 50;
  if (!Number.isFinite(rawLimit)) return json(res, 400, { error: 'Invalid limit.' });
  return json(res, 200, { notifications: await listAgentNotifications(rawLimit) });
}
