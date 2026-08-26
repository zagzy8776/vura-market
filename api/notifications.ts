import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from './_lib/db.js';
import { getSessionUser, requireUser } from './_lib/auth.js';
import { notifyAdmins } from './_lib/notifications.js';
import { customerDeepLink, sendOneSignalPush } from './_lib/onesignal.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Push opt-in (optional session) — keeps a separate serverless file off the Hobby limit
    if (req.method === 'POST' && (req.body?.action === 'push-subscribe' || req.body?.kind === 'welcome' || req.body?.kind === 'subscribed')) {
      const user = await getSessionUser(req);
      const kind = typeof req.body?.kind === 'string' ? req.body.kind : 'welcome';

      if (user?.id) {
        await sql`
          INSERT INTO notifications (user_id, order_id, type, title, body)
          VALUES (
            ${user.id},
            null,
            'push.welcome',
            'Welcome to Vura alerts',
            'You will get updates on orders, payment, and delivery on this device.'
          )
        `;

        void sendOneSignalPush({
          externalUserIds: [String(user.id)],
          title: 'Welcome to Vura',
          body: 'Notifications are on. We will alert you about your orders and delivery.',
          url: customerDeepLink(null),
          data: { side: user.role === 'admin' ? 'admin' : 'customer', eventType: 'push.welcome' },
        });
      }

      if (kind === 'welcome' || kind === 'subscribed') {
        const label = user?.email || (user?.id ? `User ${String(user.id).slice(0, 8)}` : 'A visitor');
        await notifyAdmins({
          orderId: null,
          orderNumber: null,
          eventType: 'push.subscriber.admin',
          title: 'New push subscriber',
          body: `${label} enabled notifications on their device.`,
          subject: 'Vura: new push subscriber',
          text: `${label} allowed browser notifications.`,
          html: `<p><strong>${label}</strong> enabled push notifications.</p>`,
        });
      }

      return json(res, 200, { ok: true });
    }

    const user = await requireUser(req, res);
    if (!user) return;

    if (req.method === 'GET') {
      const rows = await sql`SELECT id, order_id, type, title, body, read_at, created_at FROM notifications WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 50`;
      return json(res, 200, { notifications: rows, unreadCount: rows.filter((row) => !row.read_at).length });
    }

    if (req.method === 'PATCH') {
      const { notificationId } = req.body || {};
      if (typeof notificationId !== 'string') return json(res, 400, { error: 'Notification is required.' });
      const rows = await sql`UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = ${notificationId} AND user_id = ${user.id} RETURNING id, read_at`;
      if (!rows[0]) return json(res, 404, { error: 'Notification not found.' });
      return json(res, 200, { notification: rows[0] });
    }

    return json(res, 405, { error: 'Method not allowed' });
  } catch {
    return json(res, 500, { error: 'Notifications are temporarily unavailable.' });
  }
}
