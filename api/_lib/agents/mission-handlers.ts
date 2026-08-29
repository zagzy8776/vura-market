import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';
import { json } from '../db.js';
import { createGrowthMission, getMission, listMissions, tickGrowthMission } from './missions.js';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/**
 * Admin resource=agent-missions — start a governed Growth mission + observability.
 * Backend only. No Studio UI yet.
 */
export async function handleAgentMissions(
  req: VercelRequest,
  res: VercelResponse,
  method: Method,
  admin: { id: string },
) {
  const requestId = randomUUID();
  res.setHeader('X-Request-ID', requestId);

  if (method === 'GET') {
    const missionId = typeof req.query.missionId === 'string' ? req.query.missionId : '';
    if (missionId) {
      const detail = await getMission(missionId);
      return detail
        ? json(res, 200, { ...detail, requestId })
        : json(res, 404, { error: 'Mission not found.', requestId });
    }
    const rawLimit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 20;
    const limit = Math.min(50, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : 20));
    const missions = await listMissions(limit);
    return json(res, 200, { missions, requestId });
  }

  if (method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });

  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
  const categories = Array.isArray(body.categories)
    ? body.categories.filter((c): c is string => typeof c === 'string').slice(0, 20)
    : [];
  const opportunityId = typeof body.opportunityId === 'string' ? body.opportunityId : undefined;
  const productName = typeof body.productName === 'string' ? body.productName : undefined;
  if (goal.length < 3) return json(res, 400, { error: 'goal is required.', requestId });

  try {
    const mission = await createGrowthMission({
      goal,
      categories,
      opportunityId,
      productName,
      createdBy: admin.id,
    });
    // Advance queued → ready steps and run the governed DAG.
    await tickGrowthMission(mission.missionId).catch(() => undefined);
    return json(res, 200, {
      ...mission,
      requestId,
      message: 'Growth mission started. Agent steps run through the governed tool loop.',
    });
  } catch (error) {
    return json(res, 500, {
      error: error instanceof Error ? error.message : 'Failed to create mission.',
      requestId,
    });
  }
}
