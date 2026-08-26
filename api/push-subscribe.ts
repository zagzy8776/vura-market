import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, json } from './_lib/db.js';
import { getSessionUser } from './_lib/auth.js';
import { notifyAdmins } from './_lib/notifications.js';
import { customerDeepLink, sendOneSignalPush } from './_lib/onesignal.js';

/**
 * POST /api/push-subscribe
 * Called once from the browser after the user Allows notifications.
 * - Welcome push to that user (if logged in)
 * - One admin alert: someone enabled push (not every page view)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
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
  } catch {
    return json(res, 500, { error: 'Could not register push subscription.' });
  }
}
