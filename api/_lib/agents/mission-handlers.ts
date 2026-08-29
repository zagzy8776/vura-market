import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';
import { json } from '../db.js';
import { createGrowthMission, getMission, listMissions, tickGrowthMission } from './missions.js';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

type Admin = { id: string };

function isMissionSchemaUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: unknown; message?: unknown };
  const code = String(value.code || '');
  const message = String(value.message || '').toLowerCase();
  return code === '42P01' && (message.includes('agent_missions') || message.includes('agent_mission_steps'));
}

function schemaUnavailable(res: VercelResponse, requestId: string, status: 200 | 503) {
  return json(res, status, {
    ...(status === 200 ? { missions: [], available: false } : {}),
    error: 'Growth missions are temporarily unavailable until database migration 033_agent_missions is applied.',
    code: 'MISSION_SCHEMA_UNAVAILABLE',
    migration: '033_agent_missions',
    requestId,
  });
}

/**
 * Admin resource=agent-missions — start a governed Growth mission + observability.
 * Unauthorized callers cannot start or list missions. All other resources still
 * go through admin-runtime.
 *
 * The Command Center must remain usable if the UI deploy reaches production
 * before the mission migration reaches the database. A missing mission table is
 * therefore treated as a known deployment-state condition, not a Command Center
 * 500. Once migration 033 is applied, this resource behaves normally.
 */
export async function handleAgentMissions(
  req: VercelRequest,
  res: VercelResponse,
  method: Method,
  admin: Admin,
) {
  const requestId = randomUUID();
  res.setHeader('X-Request-ID', requestId);

  if (method === 'GET') {
    try {
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
      return json(res, 200, { missions, available: true, requestId });
    } catch (error) {
      if (isMissionSchemaUnavailable(error)) return schemaUnavailable(res, requestId, 200);
      return json(res, 500, {
        error: error instanceof Error ? error.message : 'Failed to load missions.',
        requestId,
      });
    }
  }

  if (method !== 'POST') return json(res, 405, { error: 'Method not allowed.', requestId });

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
    if (isMissionSchemaUnavailable(error)) return schemaUnavailable(res, requestId, 503);
    return json(res, 500, {
      error: error instanceof Error ? error.message : 'Failed to create mission.',
      requestId,
    });
  }
}
