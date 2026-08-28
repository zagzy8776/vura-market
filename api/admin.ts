import type { VercelRequest, VercelResponse } from '@vercel/node';
import handler from './_lib/admin-runtime.js';
import { applySecurityHeaders } from './_lib/http.js';
import { requireAdmin, requireAdminPermission } from './_lib/auth.js';
import { handleAgentMissions } from './_lib/agents/mission-handlers.js';

function resource(req: VercelRequest) {
  const value = req.query.resource;
  return Array.isArray(value) ? value[0] : value || '';
}

/**
 * Intercept agent-missions here so we don't need a large admin-runtime patch.
 * Unauthorized callers cannot start or list missions.
 * All other resources still go through admin-runtime.
 */
export default async function adminEntry(req: VercelRequest, res: VercelResponse) {
  if (resource(req) === 'agent-missions') {
    applySecurityHeaders(res);
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const ok = await requireAdminPermission(req, res, 'dashboard.read');
    if (!ok) return;
    const method = (req.method || 'GET') as 'GET' | 'POST' | 'PATCH' | 'DELETE';
    return handleAgentMissions(req, res, method, admin);
  }
  return handler(req, res);
}
