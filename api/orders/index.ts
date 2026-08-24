import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db';
import { requireUser } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    if (req.method === 'GET') {
      const rows = await sql`SELECT o.id, o.quantity, o.total_kobo, o.status, o.payment_method, o.payment_status, o.sourcing_status, o.delivery_name, o.delivery_phone, o.delivery_address, o.delivery_city, o.created_at, p.name AS product_name, p.brand, ARRAY_AGG(pi.image_url ORDER BY pi.sort_order) FILTER (WHERE pi.image_url IS NOT NULL) AS images FROM orders o JOIN products p ON p.id = o.product_id LEFT JOIN product_images pi ON pi.product_id = p.id WHERE o.buyer_id = ${user.id} GROUP BY o.id, p.name, p.brand ORDER BY o.created_at DESC LIMIT 100`;
      return json(res, 200, { orders: rows });
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const { productId, quantity, name, phone, address, city } = req.body || {};
    if (typeof productId !== 'string' || !Number.isInteger(quantity) || quantity < 1 || quantity > 10 || [name, phone, address, city].some((value) => typeof value !== 'string' || value.trim().length < 2)) return json(res, 400, { error: 'Please check your delivery details.' });
    const rows = await sql`INSERT INTO orders (buyer_id, product_id, quantity, unit_price_kobo, total_kobo, delivery_name, delivery_phone, delivery_address, delivery_city, payment_method) SELECT ${user.id}, id, ${quantity}, price_kobo, price_kobo * ${quantity}, ${name.trim()}, ${phone.trim()}, ${address.trim()}, ${city.trim()}, 'bank_transfer' FROM products WHERE id = ${productId} AND is_active = true AND stock_status = 'available' RETURNING id, total_kobo, payment_method, payment_status`;
    if (!rows[0]) return json(res, 409, { error: 'That product is no longer available.' });
    const settings = await sql`SELECT key, value FROM platform_settings WHERE key IN ('payout_account_number', 'payout_account_name', 'payout_bank_name')`;
    const paymentDetails = Object.fromEntries(settings.map((row) => [row.key, row.value]));
    return json(res, 201, {
      order: rows[0],
      payment: {
        method: 'bank_transfer',
        accountNumber: paymentDetails.payout_account_number || '',
        accountName: paymentDetails.payout_account_name || '',
        bankName: paymentDetails.payout_bank_name || '',
      },
    });
  } catch {
    return json(res, 500, { error: 'We could not process that request.' });
  }
}
