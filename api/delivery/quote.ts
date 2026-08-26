import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db.js';
import { applySecurityHeaders } from '../_lib/http.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  applySecurityHeaders(res);
  try {
    const stateCodeRaw = req.query.stateCode;
    const stateCode = (Array.isArray(stateCodeRaw) ? stateCodeRaw[0] : stateCodeRaw || '')?.toString().trim().toUpperCase().slice(0, 4) || null;
    const subtotalRaw = Number(Array.isArray(req.query.subtotalKobo) ? req.query.subtotalKobo[0] : req.query.subtotalKobo);
    const subtotal = Number.isFinite(subtotalRaw) && subtotalRaw >= 0 ? Math.round(subtotalRaw) : 0;

    if (stateCode && !/^[A-Z]{2}$/.test(stateCode)) {
      return json(res, 400, { error: 'Invalid state.' });
    }

    let stateName: string | null = null;
    if (stateCode) {
      const rows = await sql`SELECT name FROM nigeria_states WHERE code = ${stateCode} LIMIT 1` as Array<{ name: string }>;
      stateName = rows[0]?.name ?? null;
    }

    const quotes = await sql`SELECT * FROM quote_delivery(${stateCode}, ${subtotal})` as Array<{ fee_kobo: number; eta_min_days: number; eta_max_days: number; zone_name: string }>;
    const quote = quotes[0];
    if (!quote) return json(res, 404, { error: 'Delivery to that state is not available yet.' });

    return json(res, 200, {
      quote: {
        stateCode,
        stateName,
        zoneName: quote.zone_name,
        feeKobo: Number(quote.fee_kobo),
        etaMinDays: quote.eta_min_days,
        etaMaxDays: quote.eta_max_days,
      },
    });
  } catch {
    return json(res, 500, { error: 'Delivery estimates are temporarily unavailable.' });
  }
}
