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

type Buyer = { id: string; email: string; name: string; role: string };

type LineIn = { productId?: string; variantId?: string | null; quantity?: number };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sessionUser = await getSessionUser(req);
  try {
    if (req.method === 'GET') {
      if (!sessionUser) return json(res, 401, { error: 'Sign in required.' });
      const rows = await sql`
        SELECT o.id, o.order_number, o.quantity, o.total_kobo, o.status, o.payment_method, o.payment_status,
               o.transfer_reference, o.payment_submitted_at, o.payment_verified_at, o.sourcing_status,
               o.delivery_name, o.delivery_phone, o.delivery_address, o.delivery_city, o.created_at,
               p.name AS product_name, p.brand,
               ARRAY_AGG(pi.image_url ORDER BY pi.sort_order) FILTER (WHERE pi.image_url IS NOT NULL) AS images
        FROM orders o
        JOIN products p ON p.id = o.product_id
        LEFT JOIN product_images pi ON pi.product_id = p.id
        WHERE o.buyer_id = ${sessionUser.id}
        GROUP BY o.id, p.name, p.brand
        ORDER BY o.created_at DESC
        LIMIT 100`;
      return json(res, 200, { orders: rows });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    const body = req.body || {};

    // Normalize lines: new cart checkout uses `items[]`; legacy uses productId + quantity
    let lines: Array<{ productId: string; quantity: number }> = [];
    if (Array.isArray(body.items) && body.items.length > 0) {
      for (const raw of body.items as LineIn[]) {
        const productId = typeof raw?.productId === 'string' ? raw.productId : '';
        const quantity = Number(raw?.quantity || 1);
        if (!productId) continue;
        if (!Number.isFinite(quantity) || quantity < 1) {
          return json(res, 400, { error: 'Quantity must be at least 1.' });
        }
        lines.push({ productId, quantity: Math.min(Math.floor(quantity), 20) });
      }
    } else if (typeof body.productId === 'string' && body.productId) {
      const quantity = Number(body.quantity || 1);
      if (!Number.isFinite(quantity) || quantity < 1) {
        return json(res, 400, { error: 'Quantity must be at least 1.' });
      }
      lines = [{ productId: body.productId, quantity: Math.min(Math.floor(quantity), 20) }];
    }

    if (!lines.length) return json(res, 400, { error: 'Product is required.' });

    // Delivery fields — support both flat and address-object shapes from CheckoutPage
    const address = body.address && typeof body.address === 'object' ? body.address : {};
    const deliveryName = (
      (typeof body.deliveryName === 'string' && body.deliveryName) ||
      (typeof body.name === 'string' && body.name) ||
      ''
    ).trim();
    const deliveryPhone = (
      (typeof body.deliveryPhone === 'string' && body.deliveryPhone) ||
      (typeof body.phone === 'string' && body.phone) ||
      ''
    ).trim();
    const street = (typeof address.street === 'string' && address.street) ||
      (typeof body.deliveryAddress === 'string' && body.deliveryAddress) ||
      '';
    const city = (typeof address.city === 'string' && address.city) ||
      (typeof address.area === 'string' && address.area) ||
      (typeof body.deliveryCity === 'string' && body.deliveryCity) ||
      '';
    const stateName = (typeof address.stateName === 'string' && address.stateName) || '';
    const lga = (typeof address.lga === 'string' && address.lga) || '';
    const landmark = (typeof address.landmark === 'string' && address.landmark) || '';
    const deliveryAddress = [street, lga, city, stateName, landmark].filter(Boolean).join(', ').trim();
    const deliveryCity = city || stateName || null;
    const guestEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const guestName = deliveryName;

    if (deliveryName.length < 2 || deliveryPhone.length < 7 || deliveryAddress.length < 5) {
      return json(res, 400, { error: 'Delivery name, phone and address are required.' });
    }

    let buyer: Buyer | null = sessionUser
      ? { id: sessionUser.id, email: sessionUser.email, name: sessionUser.name, role: sessionUser.role }
      : null;
    let isNewGuest = false;
    let claimToken: string | undefined;

    if (!buyer) {
      if (!guestEmail || guestEmail.length < 5) {
        return json(res, 400, { error: 'Email is required for guest checkout.' });
      }
      const existing = await sql`SELECT id, email, name, role FROM users WHERE email = ${guestEmail} LIMIT 1`;
      if (existing[0]) {
        buyer = existing[0] as Buyer;
      } else {
        isNewGuest = true;
        const tempPassword = randomBytes(16).toString('hex');
        const passwordHash = await hash(tempPassword, 10);
        const created = await sql`
          INSERT INTO users (email, name, password_hash, role)
          VALUES (${guestEmail}, ${guestName || 'Customer'}, ${passwordHash}, 'customer')
          RETURNING id, email, name, role`;
        buyer = created[0] as Buyer;
      }
    }

    // Resolve products
    const createdOrders: Array<{ id: string; order_number: string; total_kobo: number }> = [];
    let subtotalKobo = 0;
    const productNames: string[] = [];

    for (const line of lines) {
      const productRows = await sql`
        SELECT id, name, price_kobo, is_active FROM products WHERE id = ${line.productId}::uuid LIMIT 1`;
      if (!productRows[0] || productRows[0].is_active === false) {
        return json(res, 404, { error: 'Product not available.' });
      }
      const unit = Number(productRows[0].price_kobo);
      const lineTotal = unit * line.quantity;
      subtotalKobo += lineTotal;
      productNames.push(String(productRows[0].name));

      const rows = await sql`
        INSERT INTO orders (
          buyer_id, product_id, quantity, total_kobo, status, payment_method, payment_status,
          delivery_name, delivery_phone, delivery_address, delivery_city
        ) VALUES (
          ${buyer!.id}, ${line.productId}::uuid, ${line.quantity}, ${lineTotal},
          'awaiting_payment', 'bank_transfer', 'unpaid',
          ${deliveryName}, ${deliveryPhone}, ${deliveryAddress}, ${deliveryCity}
        )
        RETURNING id, order_number, total_kobo`;
      createdOrders.push(rows[0] as { id: string; order_number: string; total_kobo: number });
    }

    const settings = await sql`
      SELECT key, value FROM platform_settings
      WHERE key IN ('payout_account_number', 'payout_account_name', 'payout_bank_name')`;
    const paymentDetails = Object.fromEntries(settings.map((row) => [row.key, row.value]));

    if (isNewGuest) {
      await createSession(req, res, buyer!.id);
      const issued = await issueClaimToken(buyer!.id);
      claimToken = issued.rawToken;
    }

    const primary = createdOrders[0];
    const productName = productNames.join(', ') || 'your product';
    const claimUrl = claimToken
      ? `${originFromRequest(req)}/account/claim?token=${encodeURIComponent(claimToken)}`
      : undefined;

    const emailData = orderEmail(
      {
        orderNumber: primary.order_number,
        productName,
        totalKobo: subtotalKobo,
        accountNumber: paymentDetails.payout_account_number || '',
        accountName: paymentDetails.payout_account_name || '',
        bankName: paymentDetails.payout_bank_name || '',
      },
      buyer!.name,
      { claimUrl },
    );
    const customerMessage = `Your order ${primary.order_number} is ready for bank-transfer payment. We are waiting for your transfer confirmation.`;
    const adminEmail = simpleOrderEmail(
      `New Vura order ${primary.order_number}`,
      'Vura admin',
      primary.order_number,
      `A new order for ${productName} was created for ${(subtotalKobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })} NGN. Payment is awaiting confirmation.`,
    );

    await notifyUser({
      userId: buyer!.id,
      email: buyer!.email,
      firstName: buyer!.name,
      orderId: primary.id,
      orderNumber: primary.order_number,
      eventType: 'order.created',
      title: 'Order received',
      body: customerMessage,
      subject: emailData.subject,
      text: emailData.text,
      html: emailData.html,
    });
    await notifyAdmins({
      orderId: primary.id,
      orderNumber: primary.order_number,
      eventType: 'order.created.admin',
      title: `New order ${primary.order_number}`,
      body: `A new order for ${productName} is awaiting payment confirmation.`,
      subject: adminEmail.subject,
      text: adminEmail.text,
      html: adminEmail.html,
    });

    const payment = {
      method: 'bank_transfer',
      accountNumber: paymentDetails.payout_account_number || '',
      accountName: paymentDetails.payout_account_name || '',
      bankName: paymentDetails.payout_bank_name || '',
    };

    // Shape expected by CheckoutPage + legacy single-order clients
    return json(res, 201, {
      order: primary,
      orders: createdOrders,
      totals: { subtotalKobo, deliveryKobo: 0, totalKobo: subtotalKobo },
      delivery: { zoneName: stateName || deliveryCity || 'Nigeria', etaMinDays: 2, etaMaxDays: 5 },
      payment,
    });
  } catch (err) {
    console.error('[orders]', err);
    return json(res, 500, { error: 'We could not process that request.' });
  }
}
