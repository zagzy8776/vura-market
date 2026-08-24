import { createHmac } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db';

export const config = { api: { bodyParser: false } };

async function rawBody(req: VercelRequest) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return res.status(503).json({ error: 'Payments are not configured.' });
  try {
    const body = await rawBody(req);
    const signature = String(req.headers['x-paystack-signature'] || '');
    const expected = createHmac('sha512', secret).update(body).digest('hex');
    if (!signature || signature.length !== expected.length || !createHmac('sha512', secret).update(body).digest('hex').toLowerCase().includes(signature.toLowerCase())) return res.status(401).json({ error: 'Invalid signature.' });
    const event = JSON.parse(body.toString('utf8')) as { event?: string; data?: { reference?: string; status?: string; amount?: number; metadata?: { order_id?: string } } };
    if (event.event === 'charge.success' && event.data?.reference) {
      const reference = event.data.reference;
      const rows = await sql`SELECT id, total_kobo FROM orders WHERE payment_reference = ${reference} LIMIT 1`;
      if (rows[0] && event.data.status === 'success' && Number(event.data.amount) === Number(rows[0].total_kobo)) {
        await sql`UPDATE orders SET payment_status = 'paid', status = 'paid', paid_at = COALESCE(paid_at, now()), updated_at = now() WHERE id = ${rows[0].id} AND payment_status <> 'paid'`;
      }
    }
    return res.status(200).json({ received: true });
  } catch {
    return res.status(400).json({ error: 'Invalid webhook payload.' });
  }
}
