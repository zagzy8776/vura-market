import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json } from '../_lib/db.js';
import { getSessionUser } from '../_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  try {
    const user = await getSessionUser(req);
    return json(res, 200, { user });
  } catch {
    return json(res, 500, { error: 'We could not load your session.' });
  }
}
