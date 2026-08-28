import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';
import { requireAdmin, requireAdminPermission } from '../_lib/auth.js';
import { applySecurityHeaders } from '../_lib/http.js';
import { json } from '../_lib/db.js';
import { runAgent, getRun, getAgentPolicy } from '../_lib/agents/runtime.js';
import type { AgentId, ModelProvider } from '../_lib/agents/types.js';

const agents = new Set<AgentId>([
  'product-intelligence', 'trend-intelligence', 'marketing-intelligence', 'sales', 'operations', 'engineering',
]);
const providers = new Set<ModelProvider>(['groq', 'cerebras', 'gemini']);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applySecurityHeaders(res);
  if (req.method !== 'POST' && req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const ok = await requireAdminPermission(req, res, 'dashboard.read');
  if (!ok) return;

  if (req.method === 'GET') {
    const runId = typeof req.query.runId === 'string' ? req.query.runId : '';
    if (!runId) return json(res, 400, { error: 'runId is required.' });
    const run = getRun(runId);
    return run ? json(res, 200, { run }) : json(res, 404, { error: 'Agent run not found.' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
  const agentId = typeof body.agentId === 'string' ? body.agentId as AgentId : null;
  const task = typeof body.task === 'string' ? body.task.trim() : '';
  const requestedProviders = Array.isArray(body.providers)
    ? body.providers.filter((value): value is ModelProvider => typeof value === 'string' && providers.has(value as ModelProvider))
    : undefined;

  if (!agentId || !agents.has(agentId)) return json(res, 400, { error: 'Unknown agent.' });
  if (task.length < 3 || task.length > 4000) return json(res, 400, { error: 'Task must be between 3 and 4000 characters.' });
  if (requestedProviders && requestedProviders.length === 0) return json(res, 400, { error: 'No valid model providers supplied.' });

  const requestId = randomUUID();
  res.setHeader('X-Request-ID', requestId);
  const result = await runAgent({ agentId, task, providers: requestedProviders });
  return json(res, 200, { requestId, policy: getAgentPolicy(agentId), ...result });
}
