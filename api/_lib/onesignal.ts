/**
 * OneSignal REST helper (server-only).
 * Env:
 *   ONESIGNAL_APP_ID
 *   ONESIGNAL_REST_API_KEY
 * Optional:
 *   APP_URL  — used for click-through deep links
 */

type PushTarget = {
  /** Your app user ids (OneSignal external_id after login()) */
  externalUserIds: string[];
  title: string;
  body: string;
  /** Full URL opened when the user taps the notification */
  url?: string;
  data?: Record<string, string>;
};

export function onesignalConfigured() {
  return Boolean(process.env.ONESIGNAL_APP_ID && process.env.ONESIGNAL_REST_API_KEY);
}

export async function sendOneSignalPush(target: PushTarget): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const appId = process.env.ONESIGNAL_APP_ID;
  const apiKey = process.env.ONESIGNAL_REST_API_KEY;
  if (!appId || !apiKey) {
    return { ok: true, skipped: true };
  }

  const ids = [...new Set(target.externalUserIds.filter(Boolean))];
  if (!ids.length) return { ok: true, skipped: true };

  try {
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Basic ${apiKey}`,
      },
      body: JSON.stringify({
        app_id: appId,
        include_external_user_ids: ids,
        channel_for_external_user_ids: 'push',
        headings: { en: target.title },
        contents: { en: target.body },
        url: target.url || undefined,
        data: target.data || undefined,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `OneSignal ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'OneSignal request failed' };
  }
}

export function appBaseUrl() {
  const raw = process.env.APP_URL || process.env.VITE_APP_URL || '';
  return raw.replace(/\/$/, '') || '';
}

export function adminDeepLink(orderNumber?: string | null) {
  const base = appBaseUrl();
  if (!base) return undefined;
  if (orderNumber) return `${base}/studio?tab=orders&order=${encodeURIComponent(orderNumber)}`;
  return `${base}/studio`;
}

export function customerDeepLink(orderNumber?: string | null) {
  const base = appBaseUrl();
  if (!base) return undefined;
  if (orderNumber) return `${base}/?order=${encodeURIComponent(orderNumber)}`;
  return `${base}/`;
}
