/**
 * OneSignal Web SDK bootstrap (browser only).
 * Requires VITE_ONESIGNAL_APP_ID in the client env.
 *
 * After login, call linkOneSignalUser(userId) so server can target
 * include_external_user_ids: [userId].
 */

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: OneSignalAPI) => void | Promise<void>>;
    OneSignal?: OneSignalAPI;
  }
}

type OneSignalAPI = {
  init: (opts: Record<string, unknown>) => Promise<void>;
  login: (externalId: string) => Promise<void>;
  logout: () => Promise<void>;
  User?: { PushSubscription?: { optedIn?: boolean } };
  Notifications?: {
    permission?: string;
    requestPermission?: () => Promise<void>;
  };
};

let scriptLoaded = false;
let initStarted = false;

function appId() {
  return (import.meta as any).env?.VITE_ONESIGNAL_APP_ID as string | undefined;
}

function loadScript(): Promise<void> {
  if (scriptLoaded || typeof document === 'undefined') return Promise.resolve();
  if ((window as any).__onesignalScriptPromise) return (window as any).__onesignalScriptPromise;

  (window as any).__onesignalScriptPromise = new Promise<void>((resolve, reject) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    const s = document.createElement('script');
    s.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
    s.async = true;
    s.onload = () => {
      scriptLoaded = true;
      resolve();
    };
    s.onerror = () => reject(new Error('Failed to load OneSignal SDK'));
    document.head.appendChild(s);
  });

  return (window as any).__onesignalScriptPromise;
}

/** Init once (safe to call from main). No-ops without App ID. */
export async function initOneSignal() {
  const id = appId();
  if (!id || typeof window === 'undefined') return;
  if (initStarted) return;
  initStarted = true;

  try {
    await loadScript();
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      await OneSignal.init({
        appId: id,
        allowLocalhostAsSecureOrigin: true,
      });
    });
  } catch {
    initStarted = false;
  }
}

/** Bind this browser to your logged-in user id (admin or customer). */
export async function linkOneSignalUser(userId: string | null | undefined) {
  if (!userId || !appId() || typeof window === 'undefined') return;
  try {
    await loadScript();
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        await OneSignal.login(String(userId));
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }
}

export async function unlinkOneSignalUser() {
  if (!appId() || typeof window === 'undefined') return;
  try {
    await loadScript();
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        await OneSignal.logout();
      } catch {
        // ignore
      }
    });
  } catch {
    // ignore
  }
}
