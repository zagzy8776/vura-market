import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { applySecurityHeaders } from '../_lib/http.js';
import { getCourierProvider } from '../_lib/courier.js';

export const config = { api: { bodyParser: false } };

const MAX_BODY_BYTES = 64 * 1024;

function readRawBody(req: VercelRequest): Promise<string> {
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

async function processEvent(eventId: number, rawBody: string, providerCode: string): Promise<void> {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  applySecurityHeaders(res);
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
    await processEvent(inserted[0].id as number, rawBody, providerCode);
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
