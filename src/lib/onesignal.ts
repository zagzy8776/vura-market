/**
 * OneSignal Web SDK (browser).
 * App ID: e1e24d70-25cf-4c01-b66e-f17b8a73a0ea
 * Service worker: /OneSignalSDKWorker.js
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
  User?: {
    PushSubscription?: {
      optedIn?: boolean;
      addEventListener?: (event: string, cb: (obj: { current?: { optedIn?: boolean } }) => void) => void;
    };
  };
  Notifications?: {
    permission?: boolean | string;
    requestPermission?: () => Promise<boolean | void>;
  };
};

const DEFAULT_APP_ID = 'e1e24d70-25cf-4c01-b66e-f17b8a73a0ea';
const WELCOME_KEY = 'vura_onesignal_welcome_v1';

let initStarted = false;
let initDone = false;

function appId() {
  return (
    (import.meta as { env?: { VITE_ONESIGNAL_APP_ID?: string } }).env?.VITE_ONESIGNAL_APP_ID ||
    DEFAULT_APP_ID
  );
}

function defer(fn: (OneSignal: OneSignalAPI) => void | Promise<void>) {
  if (typeof window === 'undefined') return;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(fn);
}

async function reportSubscription(kind: 'welcome' | 'subscribed') {
  try {
    await fetch('/api/notifications', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'push-subscribe', kind }),
    });
  } catch {
    // ignore
  }
}

function alreadyWelcomed() {
  try {
    return localStorage.getItem(WELCOME_KEY) === '1';
  } catch {
    return false;
  }
}

function markWelcomed() {
  try {
    localStorage.setItem(WELCOME_KEY, '1');
  } catch {
    // ignore
  }
}

async function onOptedIn() {
  if (alreadyWelcomed()) return;
  markWelcomed();
  await reportSubscription('welcome');
}

export function isIosSafariNotPwa() {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  if (!isIOS) return false;
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  return !standalone;
}

export function isPushSupported() {
  if (typeof window === 'undefined') return false;
  if (isIosSafariNotPwa()) return false;
  return 'Notification' in window && 'serviceWorker' in navigator;
}

export async function getPushPermissionState(): Promise<'granted' | 'denied' | 'default' | 'unsupported'> {
  if (!isPushSupported()) return 'unsupported';
  try {
    const p = Notification.permission;
    if (p === 'granted' || p === 'denied' || p === 'default') return p;
  } catch {
    /* ignore */
  }
  return 'default';
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = window.setTimeout(() => resolve(fallback), ms);
    promise
      .then((v) => {
        window.clearTimeout(t);
        resolve(v);
      })
      .catch(() => {
        window.clearTimeout(t);
        resolve(fallback);
      });
  });
}

/** Must be called from a user tap. Never hangs more than a few seconds. */
export async function requestPushPermission(): Promise<boolean> {
  if (!isPushSupported()) return false;

  // Prefer native API first (works even if OneSignal is slow)
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const result = await withTimeout(Notification.requestPermission(), 8000, 'default');
      if (result === 'granted') {
        await onOptedIn();
        // Still try OneSignal login path in background
        defer(async (OneSignal) => {
          try {
            await OneSignal.Notifications?.requestPermission?.();
          } catch {
            /* ignore */
          }
        });
        return true;
      }
      if (result === 'denied') return false;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      await onOptedIn();
      return true;
    }
  } catch {
    /* fall through to OneSignal */
  }

  return withTimeout(
    new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (v: boolean) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };

      defer(async (OneSignal) => {
        try {
          await OneSignal.Notifications?.requestPermission?.();
          const opted =
            Boolean(OneSignal.User?.PushSubscription?.optedIn) ||
            (typeof Notification !== 'undefined' && Notification.permission === 'granted');
          if (opted) await onOptedIn();
          done(opted);
        } catch {
          done(typeof Notification !== 'undefined' && Notification.permission === 'granted');
        }
      });
    }),
    10000,
    false,
  );
}

export async function initOneSignal() {
  if (typeof window === 'undefined' || initStarted) return;
  initStarted = true;

  defer(async (OneSignal) => {
    try {
      await OneSignal.init({
        appId: appId(),
        serviceWorkerPath: '/OneSignalSDKWorker.js',
        serviceWorkerParam: { scope: '/' },
        allowLocalhostAsSecureOrigin: true,
      });
      initDone = true;
    } catch {
      initDone = true;
    }

    try {
      OneSignal.User?.PushSubscription?.addEventListener?.('change', (event) => {
        if (event?.current?.optedIn) void onOptedIn();
      });
    } catch {
      // ignore
    }

    if (OneSignal.User?.PushSubscription?.optedIn) void onOptedIn();
  });
}

export async function linkOneSignalUser(userId: string | null | undefined) {
  if (!userId || typeof window === 'undefined') return;
  defer(async (OneSignal) => {
    try {
      await OneSignal.login(String(userId));
      if (OneSignal.User?.PushSubscription?.optedIn) void onOptedIn();
    } catch {
      // ignore
    }
  });
}

export async function unlinkOneSignalUser() {
  if (typeof window === 'undefined') return;
  defer(async (OneSignal) => {
    try {
      await OneSignal.logout();
    } catch {
      // ignore
    }
  });
}

export function isOneSignalReady() {
  return initDone;
}
