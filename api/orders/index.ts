import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from '../_lib/db.js';
import { createSession, getSessionUser, issueClaimToken } from '../_lib/auth.js';
import { orderEmail, simpleOrderEmail } from '../_lib/email.js';
import { notifyAdmins, notifyUser } from '../_lib/notifications.js';
import { hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';

function originFromRequest(req: VercelRequest) {
  const configured = process.env.VURA_PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (configured) return configured;
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers['host'];
  if (!host) return '';
  return `${proto}://${host}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sessionUser = await getSessionUser(req);
  try {
    if (req.method === 'GET') {
      if (!sessionUser) return json(res, 401, { error: 'Sign in required.' });
      const rows = await sql`SELECT o.id, o.order_number, o.quantity, o.total_kobo, o.status, o.payment_method, o.payment_status, o.transfer_reference, o.payment_submitted_at, o.payment_verified_at, o.sourcing_status, o.delivery_name, o.delivery_phone, o.delivery_address, o.delivery_city, o.created_at, p.name AS product_name, p.brand, ARRAY_AGG(pi.image_url ORDER BY pi.sort_order) FILTER (WHERE pi.image_url IS NOT NULL) AS images FROM orders o JOIN products p ON p.id = o.product_id LEFT JOIN product_images pi ON pi.product_id = p.id WHERE o.buyer_id = ${sessionUser.id} GROUP BY o.id, p.name, p.brand ORDER BY o.created_at DESC LIMIT 100`;
      return json(res, 200, { orders: rows });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    const body = req.body || {};
    const productId = body.productId;
    const quantity = Number(body.quantity || 1);
    const deliveryName = typeof body.deliveryName === 'string' ? body.deliveryName.trim() : '';
    const deliveryPhone = typeof body.deliveryPhone === 'string' ? body.deliveryPhone.trim() : '';
    const deliveryAddress = typeof body.deliveryAddress === 'string' ? body.deliveryAddress.trim() : '';
    const deliveryCity = typeof body.deliveryCity === 'string' ? body.deliveryCity.trim() : '';
    const guestEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const guestName = typeof body.name === 'string' ? body.name.trim() : deliveryName;

    if (typeof productId !== 'string' || !productId) return json(res, 400, { error: 'Product is required.' });
    if (!Number.isFinite(quantity) || quantity < 1) return json(res, 400, { error: 'Quantity must be at least 1.' });
    if (deliveryName.length < 2 || deliveryPhone.length < 7 || deliveryAddress.length < 5) {
      return json(res, 400, { error: 'Delivery name, phone and address are required.' });
    }

    let buyer = sessionUser;
    let isNewGuest = false;
    let claimToken: string | undefined;

    if (!buyer) {
      if (!guestEmail || guestEmail.length < 5) return json(res, 400, { error: 'Email is required for guest checkout.' });
      const existing = await sql`SELECT id, email, name, role FROM users WHERE email = ${guestEmail} LIMIT 1`;
      if (existing[0]) {
        buyer = existing[0];
      } else {
        isNewGuest = true;
        const tempPassword = randomBytes(16).toString('hex');
        const passwordHash = await hash(tempPassword, 10);
        const created = await sql`INSERT INTO users (email, name, password_hash, role) VALUES (${guestEmail}, ${guestName || 'Customer'}, ${passwordHash}, 'customer') RETURNING id, email, name, role`;
        buyer = created[0];
      }
    }

    const productRows = await sql`SELECT id, name, price_kobo, is_active FROM products WHERE id = ${productId} LIMIT 1`;
    if (!productRows[0] || productRows[0].is_active === false) return json(res, 404, { error: 'Product not available.' });

    const totalKobo = Number(productRows[0].price_kobo) * quantity;
    const rows = await sql`
      INSERT INTO orders (buyer_id, product_id, quantity, total_kobo, status, payment_method, payment_status, delivery_name, delivery_phone, delivery_address, delivery_city)
      VALUES (${buyer!.id}, ${productId}, ${quantity}, ${totalKobo}, 'awaiting_payment', 'bank_transfer', 'unpaid', ${deliveryName}, ${deliveryPhone}, ${deliveryAddress}, ${deliveryCity || null})
      RETURNING id, order_number, total_kobo
    `;

    const settings = await sql`SELECT key, value FROM platform_settings WHERE key IN ('payout_account_number', 'payout_account_name', 'payout_bank_name')`;
    const paymentDetails = Object.fromEntries(settings.map((row) => [row.key, row.value]));
    const productName = String(productRows[0]?.name || 'your product');

    if (isNewGuest) {
      await createSession(req, res, buyer!.id);
      const issued = await issueClaimToken(buyer!.id);
      claimToken = issued.rawToken;
    }

    const claimUrl = claimToken ? `${originFromRequest(req)}/account/claim?token=${encodeURIComponent(claimToken)}` : undefined;
    const emailData = orderEmail({ orderNumber: rows[0].order_number, productName, totalKobo: Number(rows[0].total_kobo), accountNumber: paymentDetails.payout_account_number || '', accountName: paymentDetails.payout_account_name || '', bankName: paymentDetails.payout_bank_name || '' }, buyer!.name, { claimUrl });
    const customerMessage = `Your order ${rows[0].order_number} is ready for bank-transfer payment. We are waiting for your transfer confirmation.`;
    const adminEmail = simpleOrderEmail(`New Vura order ${rows[0].order_number}`, 'Vura admin', rows[0].order_number, `A new order for ${productName} was created for ${(Number(rows[0].total_kobo) / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })} NGN. Payment is awaiting confirmation.`);

    await notifyUser({ userId: buyer!.id, email: buyer!.email, firstName: buyer!.name, orderId: rows[0].id, orderNumber: rows[0].order_number, eventType: 'order.created', title: 'Order received', body: customerMessage, subject: emailData.subject, text: emailData.text, html: emailData.html });
    await notifyAdmins({ orderId: rows[0].id, orderNumber: rows[0].order_number, eventType: 'order.created.admin', title: `New order ${rows[0].order_number}`, body: `A new order for ${productName} is awaiting payment confirmation.`, subject: adminEmail.subject, text: adminEmail.text, html: adminEmail.html });

    return json(res, 201, { order: rows[0], payment: { method: 'bank_transfer', accountNumber: paymentDetails.payout_account_number || '', accountName: paymentDetails.payout_account_name || '', bankName: paymentDetails.payout_bank_name || '' } });
  } catch {
    return json(res, 500, { error: 'We could not process that request.' });
  }
}
