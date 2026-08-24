import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db';
import { requireUser } from '../_lib/auth';
import { orderEmail, simpleOrderEmail } from '../_lib/email';
import { notifyAdmins, notifyUser } from '../_lib/notifications';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    if (req.method === 'GET') {
      const rows = await sql`SELECT o.id, o.order_number, o.quantity, o.total_kobo, o.status, o.payment_method, o.payment_status, o.transfer_reference, o.payment_submitted_at, o.payment_verified_at, o.sourcing_status, o.delivery_name, o.delivery_phone, o.delivery_address, o.delivery_city, o.created_at, p.name AS product_name, p.brand, ARRAY_AGG(pi.image_url ORDER BY pi.sort_order) FILTER (WHERE pi.image_url IS NOT NULL) AS images FROM orders o JOIN products p ON p.id = o.product_id LEFT JOIN product_images pi ON pi.product_id = p.id WHERE o.buyer_id = ${user.id} GROUP BY o.id, p.name, p.brand ORDER BY o.created_at DESC LIMIT 100`;
      return json(res, 200, { orders: rows });
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const { productId, quantity, name, phone, address, city } = req.body || {};
    if (typeof productId !== 'string' || !Number.isInteger(quantity) || quantity < 1 || quantity > 10 || [name, phone, address, city].some((value) => typeof value !== 'string' || value.trim().length < 2)) return json(res, 400, { error: 'Please check your delivery details.' });

    const rows = await sql`INSERT INTO orders (buyer_id, product_id, quantity, unit_price_kobo, total_kobo, delivery_name, delivery_phone, delivery_address, delivery_city, payment_method) SELECT ${user.id}, id, ${quantity}, price_kobo, price_kobo * ${quantity}, ${name.trim()}, ${phone.trim()}, ${address.trim()}, ${city.trim()}, 'bank_transfer' FROM products WHERE id = ${productId} AND is_active = true AND stock_status = 'available' RETURNING id, order_number, total_kobo, payment_method, payment_status`;
    if (!rows[0]) return json(res, 409, { error: 'That product is no longer available.' });

    if (!rows[0].order_number) {
      const numbered = await sql`UPDATE orders SET order_number = 'VURA-' || UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 10)) WHERE id = ${rows[0].id} RETURNING order_number`;
      rows[0].order_number = numbered[0]?.order_number || `VURA-${String(rows[0].id).replaceAll('-', '').slice(0, 10).toUpperCase()}`;
    }

    const settings = await sql`SELECT key, value FROM platform_settings WHERE key IN ('payout_account_number', 'payout_account_name', 'payout_bank_name')`;
    const paymentDetails = Object.fromEntries(settings.map((row) => [row.key, row.value]));
    const productRows = await sql`SELECT name FROM products WHERE id = ${productId} LIMIT 1`;
    const productName = String(productRows[0]?.name || 'your product');
    const email = orderEmail({ orderNumber: rows[0].order_number, productName, totalKobo: Number(rows[0].total_kobo), accountNumber: paymentDetails.payout_account_number || '', accountName: paymentDetails.payout_account_name || '', bankName: paymentDetails.payout_bank_name || '' }, user.name);
    const customerMessage = `Your order ${rows[0].order_number} is ready for bank-transfer payment. We are waiting for your transfer confirmation.`;
    const adminEmail = simpleOrderEmail(`New Vura order ${rows[0].order_number}`, 'Vura admin', rows[0].order_number, `A new order for ${productName} was created for ${(Number(rows[0].total_kobo) / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })} NGN. Payment is awaiting confirmation.`);

    await notifyUser({ userId: user.id, email: user.email, firstName: user.name, orderId: rows[0].id, eventType: 'order.created', title: 'Order received', body: customerMessage, subject: email.subject, text: email.text, html: email.html });
    await notifyAdmins({ orderId: rows[0].id, eventType: 'order.created.admin', title: `New order ${rows[0].order_number}`, body: `A new order for ${productName} is awaiting payment confirmation.`, subject: adminEmail.subject, text: adminEmail.text, html: adminEmail.html });

    return json(res, 201, {
      order: rows[0],
      payment: { method: 'bank_transfer', accountNumber: paymentDetails.payout_account_number || '', accountName: paymentDetails.payout_account_name || '', bankName: paymentDetails.payout_bank_name || '' },
    });
  } catch {
    return json(res, 500, { error: 'We could not process that request.' });
  }
}
