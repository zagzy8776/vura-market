import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from './_lib/db.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  const stateId = typeof req.query.stateId === 'string' ? req.query.stateId : null;
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
  if (stateId) {
    const lgas = await sql`SELECT id, name FROM nigeria_lgas WHERE state_id=${stateId} AND (${q}='' OR name ILIKE ${'%' + q + '%'}) ORDER BY name LIMIT 100`;
    return json(res, 200, { lgas });
  }
  const states = await sql`SELECT id, name, code FROM nigeria_states WHERE (${q}='' OR name ILIKE ${'%' + q + '%'}) ORDER BY name LIMIT 100`;
  return json(res, 200, { states });
}
