import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from './_lib/db';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try { await sql`SELECT 1`; return json(res, 200, { ok: true }); } catch { return json(res, 500, { ok: false }); }
}
