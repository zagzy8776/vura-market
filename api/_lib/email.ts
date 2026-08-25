/// <reference types="node" />
import { sql } from './db.js';

type EmailEvent = {
  userId?: string | null;
  orderId?: string | null;
  eventType: string;
  recipient: string;
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] || char);
}

export async function sendTransactionalEmail(event: EmailEvent) {
  const delivery = await sql`
    INSERT INTO email_deliveries (user_id, order_id, event_type, recipient, status)
    VALUES (${event.userId || null}, ${event.orderId || null}, ${event.eventType}, ${event.recipient}, 'queued')
    ON CONFLICT (order_id, event_type, recipient) WHERE order_id IS NOT NULL DO NOTHING
    RETURNING id
  `;
  if (!delivery[0]) return { sent: false, duplicate: true };

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    await sql`UPDATE email_deliveries SET status = 'failed', error_message = 'Email provider is not configured.' WHERE id = ${delivery[0].id}`;
    return { sent: false, configured: false };
  }
  try {
    const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: [event.recipient], subject: event.subject, text: event.text, html: event.html }) });
    const result = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok) throw new Error(result.message || `Email provider returned ${response.status}`);
    await sql`UPDATE email_deliveries SET status = 'sent', provider_id = ${result.id || null} WHERE id = ${delivery[0].id}`;
    return { sent: true, providerId: result.id || null };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Email delivery failed.';
    await sql`UPDATE email_deliveries SET status = 'failed', error_message = ${message} WHERE id = ${delivery[0].id}`;
    return { sent: false, configured: true, error: message };
  }
}

export function orderEmail(
  order: { orderNumber: string; productName: string; totalKobo: number; accountNumber: string; accountName: string; bankName: string },
  firstName: string,
  options?: { claimUrl?: string },
) {
  const amount = `₦${(Number(order.totalKobo) / 100).toLocaleString('en-NG')}`;
  const name = escapeHtml(firstName || 'there');
  const product = escapeHtml(order.productName);
  const number = escapeHtml(order.orderNumber);
  const accountNumber = escapeHtml(order.accountNumber);
  const accountName = escapeHtml(order.accountName);
  const bankName = escapeHtml(order.bankName);
  const claimUrl = options?.claimUrl ? escapeHtml(options.claimUrl) : '';
  const claimBlock = claimUrl
    ? `<p style="margin:24px 0 0;font-size:14px;line-height:22px;color:#77778a">We also created a Vura account so you can track this order. Set your password to keep using it for future purchases:</p><p style="margin:12px 0 0"><a href="${claimUrl}" style="display:inline-block;padding:12px 22px;background:#5b2cff;color:#ffffff;border-radius:999px;font-size:14px;font-weight:700;text-decoration:none">Set my password</a></p><p style="margin:12px 0 0;font-size:12px;line-height:18px;color:#aaaab4">This link expires in 72 hours and can only be used once.</p>`
    : `<p style="margin:24px 0 0;font-size:14px;line-height:22px;color:#77778a">After transferring, open Vura → My Orders and submit your transfer reference. We will verify it before sourcing the product.</p>`;
  const textTail = claimUrl ? ` We also created a Vura account so you can track this order. Set your password at ${claimUrl} (this link expires in 72 hours and can only be used once).` : '';
  return {
    subject: `Vura order ${order.orderNumber} received`,
    text: `Hi ${firstName || 'there'}, your Vura order ${order.orderNumber} for ${order.productName} has been received. Total: ${amount}. Please transfer to ${order.accountName}, ${order.bankName}, account ${order.accountNumber}. Then confirm your transfer in My Orders.${textTail}`,
    html: `<!doctype html><html><body style="margin:0;background:#f7f7fb;font-family:Arial,Helvetica,sans-serif;color:#151527"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:32px 16px"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:24px"><tr><td style="padding:32px"><p style="margin:0;font-size:28px;line-height:34px;font-weight:700;color:#5b2cff">vura.</p><p style="margin:24px 0 8px;font-size:16px;line-height:24px;color:#151527">Hi ${name},</p><p style="margin:0;font-size:16px;line-height:24px;color:#151527">We received your order <strong>${number}</strong> for <strong>${product}</strong>.</p><p style="margin:24px 0 8px;font-size:13px;line-height:20px;color:#77778a">TOTAL</p><p style="margin:0;font-size:30px;line-height:36px;font-weight:700;color:#151527">${amount}</p><p style="margin:24px 0 8px;font-size:13px;line-height:20px;color:#77778a">PAY BY BANK TRANSFER</p><p style="margin:0;font-size:15px;line-height:24px;color:#151527"><strong>${accountName}</strong><br>${bankName}<br>Account: <strong>${accountNumber}</strong></p>${claimBlock}</td></tr></table></td></tr></table></body></html>`,
  };
}

export function simpleOrderEmail(subject: string, firstName: string, orderNumber: string, message: string) {
  const safeName = escapeHtml(firstName || 'there');
  const safeNumber = escapeHtml(orderNumber);
  const safeMessage = escapeHtml(message);
  return { subject, text: `Hi ${firstName || 'there'}, ${message} Order: ${orderNumber}.`, html: `<!doctype html><html><body style="margin:0;background:#f7f7fb;font-family:Arial,Helvetica,sans-serif;color:#151527"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:32px 16px"><table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:24px"><tr><td style="padding:32px"><p style="margin:0;font-size:28px;line-height:34px;font-weight:700;color:#5b2cff">vura.</p><p style="margin:24px 0 8px;font-size:16px;line-height:24px;color:#151527">Hi ${safeName},</p><p style="margin:0;font-size:16px;line-height:26px;color:#151527">${safeMessage}</p><p style="margin:24px 0 0;font-size:13px;line-height:20px;color:#77778a">ORDER ${safeNumber}</p></td></tr></table></td></tr></table></body></html>` };
}
