import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db';
import { requireUser } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const user = await requireUser(req, res);
  if (!user) return;
  const { productId, quantity, name, phone, address, city } = req.body || {};
  if (typeof productId !== 'string' || !Number.isInteger(quantity) || quantity < 1 || quantity > 10 || [name, phone, address, city].some((value) => typeof value !== 'string' || value.trim().length < 2)) return json(res, 400, { error: 'Please check your delivery details.' });
  try {
    const rows = await sql`INSERT INTO orders (buyer_id, product_id, quantity, unit_price_kobo, total_kobo, delivery_name, delivery_phone, delivery_address, delivery_city) SELECT ${user.id}, id, ${quantity}, price_kobo, price_kobo * ${quantity}, ${name.trim()}, ${phone.trim()}, ${address.trim()}, ${city.trim()} FROM products WHERE id = ${productId} AND is_active = true AND stock_status = 'available' RETURNING id, total_kobo, payment_status`;
    if (!rows[0]) return json(res, 409, { error: 'That product is no longer available.' });
    return json(res, 201, { order: rows[0] });
  } catch {
    return json(res, 500, { error: 'We could not place that order.' });
  }
}
