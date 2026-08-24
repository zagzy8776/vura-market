import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json } from '../_lib/db';
import { destroySession } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    await destroySession(req, res);
    return json(res, 200, { ok: true });
  } catch {
    return json(res, 500, { error: 'We could not sign you out.' });
  }
}
