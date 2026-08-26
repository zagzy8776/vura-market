import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from './_lib/db.js';
import { applySecurityHeaders } from './_lib/http.js';
import { getSessionUser } from './_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applySecurityHeaders(res);
  try {
    if (req.method === 'GET') {
      const resource = typeof req.query.resource === 'string' ? req.query.resource : '';
      if (resource === 'trending_searches') {
        const rows = await sql`
          SELECT LOWER(payload->>'query') AS query, COUNT(*)::int AS count
            FROM analytics_events
           WHERE event_type = 'search' AND payload->>'query' IS NOT NULL AND created_at > now() - interval '14 days'
           GROUP BY LOWER(payload->>'query')
           HAVING LENGTH(LOWER(payload->>'query')) BETWEEN 2 AND 40
           ORDER BY count DESC
           LIMIT 8` as Array<{ query: string; count: number }>;
        return json(res, 200, { trending: rows.map((r) => ({ query: r.query, count: r.count })) });
      }
      return json(res, 404, { error: 'Not found.' });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
    const body = (req.body || {}) as { events?: unknown };
    const events = Array.isArray(body.events) ? body.events.slice(0, 25) : [];
    const cleanType = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 48).replace(/[^a-z_.]/gi, '') : '');
    let user = null;
    try {
      user = await getSessionUser(req);
    } catch {
      user = null;
    }
    for (const entry of events) {
      const event = entry as Record<string, unknown>;
      const type = cleanType(event?.type);
      if (!type) continue;
      const sessionId = typeof event?.sessionId === 'string' ? event.sessionId.slice(0, 64) : null;
      const path = typeof event?.path === 'string' ? event.path.slice(0, 200) : null;
      let payload = {};
      if (event?.payload && typeof event.payload === 'object') {
        try {
          payload = JSON.parse(JSON.stringify(event.payload).slice(0, 2000));
        } catch {
          payload = {};
        }
      }
      await sql`INSERT INTO analytics_events (session_id, user_id, event_type, path, payload) VALUES (${sessionId}, ${user?.id ?? null}, ${type}, ${path}, ${JSON.stringify(payload)}::jsonb)`;
    }
    return json(res, 202, { ok: true, accepted: events.length });
  } catch {
    return json(res, 202, { ok: true });
  }
}
