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

export async function notifyAdmins(params: {
  orderId?: string | null;
  eventType: string;
  title: string;
  body: string;
  subject: string;
  text: string;
  html: string;
}) {
  const admins = await sql`SELECT id, email FROM users WHERE role = 'admin' LIMIT 20`;
  await Promise.all(admins.map(async (admin) => {
    await createNotification(admin.id, params.eventType, params.title, params.body, params.orderId);
    return sendTransactionalEmail({
      userId: admin.id,
      orderId: params.orderId,
      eventType: params.eventType,
      recipient: admin.email,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
  }));
}
