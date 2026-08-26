/**
 * OneSignal helpers (browser).
 * SDK is loaded + init'd from index.html (App ID e1e24d70-...).
 * This module: soft prompt, welcome once, link external user id on login.
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

const WELCOME_KEY = 'vura_onesignal_welcome_v1';
const PROMPT_KEY = 'vura_onesignal_prompt_v1';

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

/** Soft-prompt once + welcome after Allow. Init already ran in index.html. */
export async function initOneSignal() {
  if (typeof window === 'undefined') return;

  defer(async (OneSignal) => {
    try {
      OneSignal.User?.PushSubscription?.addEventListener?.('change', (event) => {
        if (event?.current?.optedIn) void onOptedIn();
      });
    } catch {
      // ignore
    }

    try {
      const prompted = localStorage.getItem(PROMPT_KEY);
      if (!prompted) {
        window.setTimeout(() => {
          void (async () => {
            try {
              localStorage.setItem(PROMPT_KEY, '1');
              await OneSignal.Notifications?.requestPermission?.();
              if (OneSignal.User?.PushSubscription?.optedIn) void onOptedIn();
            } catch {
              // dismissed / blocked
            }
          })();
        }, 12_000);
      } else if (OneSignal.User?.PushSubscription?.optedIn) {
        void onOptedIn();
      }
    } catch {
      // ignore
    }
  });
}

/** Bind this browser to your logged-in user id (admin or customer). */
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
