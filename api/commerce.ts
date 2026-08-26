import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from './_lib/db.js';
import { getSessionUser, requireUser } from './_lib/auth.js';
import { getCourierProvider } from './_lib/courier.js';

export const config = { api: { bodyParser: false } };

const MAX_BODY_BYTES = 64 * 1024;

// bodyParser is disabled for this consolidated function so the courier
// webhook can verify signatures over exact bytes; JSON routes parse here.
function readRawBody(req: VercelRequest): Promise<string> {
  const attached = req as unknown as { rawBody?: unknown; body?: unknown };
  if (typeof attached.rawBody === 'string' && attached.rawBody.length > 0) return Promise.resolve(attached.rawBody);
  if (typeof attached.body === 'string' && attached.body.length > 0) return Promise.resolve(attached.body);
  if (attached.body && typeof attached.body === 'object') return Promise.resolve(JSON.stringify(attached.body));
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer | string) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      size += buf.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJsonBody(req: VercelRequest): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse((await readRawBody(req)) || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function analyticsHandler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      const view = typeof req.query.resource === 'string' ? req.query.resource : '';
      if (view === 'trending_searches') {
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
    const body = (await readJsonBody(req)) || {};
    const events = Array.isArray(body.events) ? body.events.slice(0, 25) : [];
    const cleanType = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 48).replace(/[^a-z_.]/gi, '') : '');
    let user: Awaited<ReturnType<typeof getSessionUser>> = null;
    for (const entry of events) {
      const event = entry as Record<string, unknown>;
      const type = cleanType(event?.type);
      if (!type) continue;
      if (!user) {
        try {
          user = await getSessionUser(req);
        } catch {
          user = null;
        }
      }
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function wishlistHandler(req: VercelRequest, res: VercelResponse) {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT p.id, p.slug, p.name, p.brand, p.price_kobo, p.compare_at_price_kobo, p.stock_status,
               w.created_at AS saved_at, c.name AS category_name, c.slug AS category_slug,
               ARRAY_AGG(pi.image_url ORDER BY pi.sort_order) FILTER (WHERE pi.image_url IS NOT NULL) AS images
          FROM wishlist_items w
          JOIN products p ON p.id = w.product_id AND p.is_active = true
          LEFT JOIN categories c ON c.id = p.category_id
          LEFT JOIN product_images pi ON pi.product_id = p.id
         WHERE w.user_id = ${user.id}
         GROUP BY p.id, c.name, c.slug, w.created_at
         ORDER BY w.created_at DESC
         LIMIT 100`;
      return json(res, 200, { items: rows });
    }

    let productId: string | null = null;
    if (req.method === 'POST') {
      const body = (await readJsonBody(req)) || {};
      productId = typeof body.productId === 'string' ? body.productId : null;
    } else if (req.method === 'DELETE') {
      const raw = req.query.productId;
      productId = (Array.isArray(raw) ? raw[0] : raw) || null;
    } else {
      return json(res, 405, { error: 'Method not allowed.' });
    }

    if (!productId || !UUID_RE.test(productId)) return json(res, 400, { error: 'Product is required.' });

    const exists = await sql`SELECT 1 FROM products WHERE id = ${productId} AND is_active = true LIMIT 1`;
    if (!exists[0]) return json(res, 404, { error: 'Product not found.' });

    if (req.method === 'POST') {
      await sql`INSERT INTO wishlist_items (user_id, product_id) VALUES (${user.id}, ${productId}) ON CONFLICT (user_id, product_id) DO NOTHING`;
      return json(res, 200, { ok: true });
    }
    await sql`DELETE FROM wishlist_items WHERE user_id = ${user.id} AND product_id = ${productId}`;
    return json(res, 200, { ok: true });
  } catch {
    return json(res, 500, { error: 'Your wishlist is temporarily unavailable.' });
  }
}

async function deliveryQuoteHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
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

async function processCourierEvent(eventId: number, rawBody: string, providerCode: string): Promise<void> {
  const provider = getCourierProvider(providerCode);
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new Error('INVALID_JSON');
  }
  const event = provider.parseWebhook(parsed);
  await sql`SELECT apply_courier_tracking_event(${event.trackingNumber}, ${event.externalEventId}, ${event.status}, ${event.message}, ${event.location || null})`;
  await sql`UPDATE courier_webhook_events SET status='processed', processed_at=now(), last_error=NULL WHERE id=${eventId}`;
}

async function courierWebhookHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const providerCode = typeof req.query.provider === 'string' ? req.query.provider : 'generic-rest';

  let rawBody: string;
  try {
    rawBody = await readRawBody(req);
  } catch (error) {
    const tooLarge = error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE';
    return res.status(tooLarge ? 413 : 400).json({ error: 'Could not read request body.' });
  }

  // Signature verification happens BEFORE any state is trusted or recorded as valid.
  let signatureValid = false;
  try {
    signatureValid = getCourierProvider(providerCode).verifyWebhook(rawBody, req.headers);
  } catch (error) {
    // Unknown provider code: reject without leaking which codes exist.
    void error;
    return res.status(401).json({ error: 'Invalid webhook.' });
  }
  if (!signatureValid) return res.status(401).json({ error: 'Invalid webhook signature.' });

  // Idempotency: (provider_code, external_event_id) is unique. A duplicate
  // delivery is acknowledged with 200 and never processed twice.
  let externalEventId = '';
  try {
    const probe = JSON.parse(rawBody) as { eventId?: unknown };
    if (typeof probe.eventId !== 'string') return res.status(400).json({ error: 'Missing eventId.' });
    externalEventId = probe.eventId;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON.' });
  }

  const inserted = await sql`
    INSERT INTO courier_webhook_events(provider_code, external_event_id, payload, signature_valid)
    VALUES (${providerCode}, ${externalEventId}, ${JSON.parse(rawBody) as object}, true)
    ON CONFLICT (provider_code, external_event_id) DO NOTHING
    RETURNING id
  `;
  if (!inserted[0]) {
    const existing = await sql`SELECT status FROM courier_webhook_events WHERE provider_code=${providerCode} AND external_event_id=${externalEventId}`;
    return res.status(200).json({ ok: true, duplicate: true, status: existing[0]?.status || 'received' });
  }

  try {
    await processCourierEvent(inserted[0].id as number, rawBody, providerCode);
    return res.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    // Transient failures stay retryable via the dead-letter recovery job;
    // permanent validation failures are marked failed immediately.
    const permanent = /^(INVALID_WEBHOOK_PAYLOAD|TRACKING_NOT_FOUND|INVALID_FULFILLMENT_STATUS)/.test(message);
    await sql`
      UPDATE courier_webhook_events
         SET status = ${permanent ? 'failed' : 'failed'},
             retry_count = retry_count + 1,
             last_error = ${message.slice(0, 500)}
       WHERE id = ${inserted[0].id as number}
    `;
    // 200 for permanent failures (provider must not retry), 500 for transient ones.
    return res.status(permanent ? 200 : 500).json({ ok: false, error: permanent ? 'rejected' : 'retry_later' });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const fn = typeof req.query.fn === 'string' ? req.query.fn : '';
  if (fn === 'analytics') return analyticsHandler(req, res);
  if (fn === 'wishlist') return wishlistHandler(req, res);
  if (fn === 'delivery_quote') return deliveryQuoteHandler(req, res);
  if (fn === 'courier_webhook') return courierWebhookHandler(req, res);
  return json(res, 404, { error: 'Not found.' });
}
