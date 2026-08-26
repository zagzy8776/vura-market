import { sql } from './db.js';
import { sendTransactionalEmail } from './email.js';
import { adminDeepLink, customerDeepLink, sendOneSignalPush } from './onesignal.js';

export async function createNotification(userId: string, type: string, title: string, body: string, orderId?: string | null) {
  await sql`
    INSERT INTO notifications (user_id, order_id, type, title, body)
    VALUES (${userId}, ${orderId || null}, ${type}, ${title}, ${body})
    ON CONFLICT (user_id, order_id, type) WHERE order_id IS NOT NULL DO NOTHING
  `;
}

export async function notifyUser(params: {
  userId: string;
  email: string;
  firstName: string;
  orderId?: string | null;
  orderNumber?: string | null;
  eventType: string;
  title: string;
  body: string;
  subject: string;
  text: string;
  html: string;
}) {
  await createNotification(params.userId, params.eventType, params.title, params.body, params.orderId);

  void sendOneSignalPush({
    externalUserIds: [params.userId],
    title: params.title,
    body: params.body,
    url: customerDeepLink(params.orderNumber),
    data: {
      side: 'customer',
      eventType: params.eventType,
      orderId: params.orderId || '',
      orderNumber: params.orderNumber || '',
    },
  });

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
  orderNumber?: string | null;
  eventType: string;
  title: string;
  body: string;
  subject: string;
  text: string;
  html: string;
}) {
  const admins = await sql`SELECT id, email FROM users WHERE role = 'admin' LIMIT 20`;
  const adminIds = admins.map((a) => String(a.id));

  void sendOneSignalPush({
    externalUserIds: adminIds,
    title: params.title,
    body: params.body,
    url: adminDeepLink(params.orderNumber),
    data: {
      side: 'admin',
      eventType: params.eventType,
      orderId: params.orderId || '',
      orderNumber: params.orderNumber || '',
    },
  });

  await Promise.all(
    admins.map(async (admin) => {
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
    }),
  );
}

const ORDER_STATUS_COPY: Record<string, { title: string; body: (n: string) => string }> = {
  confirmed: { title: 'Order confirmed', body: (n) => `Your order ${n} is confirmed. We are getting it ready.` },
  sourcing: { title: 'Sourcing your item', body: (n) => `We are sourcing your order ${n} from a local store.` },
  purchased: { title: 'Item secured', body: (n) => `Your order ${n} has been purchased and is being prepared for delivery.` },
  out_for_delivery: { title: 'Out for delivery', body: (n) => `Your order ${n} is on the way to you.` },
  delivered: { title: 'Delivered', body: (n) => `Your order ${n} has been delivered. Enjoy!` },
  cancelled: { title: 'Order cancelled', body: (n) => `Your order ${n} was cancelled. Contact support if you have questions.` },
  payment_verification: { title: 'Verifying payment', body: (n) => `We are verifying payment for order ${n}.` },
};

const PAYMENT_COPY: Record<string, { title: string; body: (n: string) => string }> = {
  paid: { title: 'Payment confirmed', body: (n) => `Payment for order ${n} is confirmed. We are moving to the next step.` },
  rejected: { title: 'Payment not accepted', body: (n) => `We could not verify payment for order ${n}. Please contact support or resubmit.` },
  pending_verification: { title: 'Payment under review', body: (n) => `Your payment for order ${n} is under review.` },
};

/** Notify the buyer when admin changes order/payment status (in-app + push + email). */
export async function notifyCustomerOrderChange(params: {
  userId: string;
  email: string;
  firstName: string;
  orderId: string;
  orderNumber: string;
  prevStatus?: string | null;
  nextStatus?: string | null;
  prevPayment?: string | null;
  nextPayment?: string | null;
}) {
  const tasks: Promise<unknown>[] = [];
  if (params.nextPayment && params.nextPayment !== params.prevPayment && PAYMENT_COPY[params.nextPayment]) {
    const c = PAYMENT_COPY[params.nextPayment];
    tasks.push(
      notifyUser({
        userId: params.userId,
        email: params.email,
        firstName: params.firstName,
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        eventType: `payment.${params.nextPayment}`,
        title: c.title,
        body: c.body(params.orderNumber),
        subject: `${c.title} · ${params.orderNumber}`,
        text: c.body(params.orderNumber),
        html: `<p>${c.body(params.orderNumber)}</p>`,
      }),
    );
  }
  if (params.nextStatus && params.nextStatus !== params.prevStatus && ORDER_STATUS_COPY[params.nextStatus]) {
    const c = ORDER_STATUS_COPY[params.nextStatus];
    tasks.push(
      notifyUser({
        userId: params.userId,
        email: params.email,
        firstName: params.firstName,
        orderId: params.orderId,
        orderNumber: params.orderNumber,
        eventType: `order.${params.nextStatus}`,
        title: c.title,
        body: c.body(params.orderNumber),
        subject: `${c.title} · ${params.orderNumber}`,
        text: c.body(params.orderNumber),
        html: `<p>${c.body(params.orderNumber)}</p>`,
      }),
    );
  }
  await Promise.all(tasks);
}

/** Broadcast promo/coupon push to customers. */
export async function notifyPromoToCustomers(params: {
  title: string;
  body: string;
  url?: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(params.limit || 300, 1), 500);
  const users = await sql`
    SELECT id, email, name FROM users
    WHERE role = 'customer'
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  if (!users.length) return { sent: 0 };

  const ids = users.map((u) => String(u.id));
  void sendOneSignalPush({
    externalUserIds: ids,
    title: params.title,
    body: params.body,
    url: params.url || customerDeepLink(null) || undefined,
    data: { side: 'customer', eventType: 'promo' },
  });

  const forDb = users.slice(0, 100);
  await Promise.all(
    forDb.map((u) =>
      sql`
        INSERT INTO notifications (user_id, order_id, type, title, body)
        VALUES (${u.id}, null, 'promo', ${params.title}, ${params.body})
      `,
    ),
  );

  return { sent: ids.length };
}
