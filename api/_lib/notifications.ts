import { sql } from './db';
import { sendTransactionalEmail } from './email';

export async function createNotification(userId: string, type: string, title: string, body: string, orderId?: string | null) {
  await sql`
    INSERT INTO notifications (user_id, order_id, type, title, body)
    VALUES (${userId}, ${orderId || null}, ${type}, ${title}, ${body})
  `;
}

export async function notifyUser(params: {
  userId: string;
  email: string;
  firstName: string;
  orderId?: string | null;
  eventType: string;
  title: string;
  body: string;
  subject: string;
  text: string;
  html: string;
}) {
  await createNotification(params.userId, params.eventType, params.title, params.body, params.orderId);
  return sendTransactionalEmail({
    userId: params.userId,
    orderId: params.orderId,
    eventType: params.eventType,
    recipient: params.email,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
}
