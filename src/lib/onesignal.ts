/**
 * OneSignal Web SDK (browser).
 * Env: VITE_ONESIGNAL_APP_ID
 *
 * - Soft-prompts after a short delay (not on first paint)
 * - On Allow: welcome once + tell server (admin can get one-time "new subscriber")
 * - linkOneSignalUser(userId) after login so server targets external_user_ids
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
    addEventListener?: (event: string, cb: (e: unknown) => void) => void;
  };
};

const WELCOME_KEY = 'vura_onesignal_welcome_v1';
const PROMPT_KEY = 'vura_onesignal_prompt_v1';

let scriptLoaded = false;
let initStarted = false;

function appId() {
  return (import.meta as { env?: { VITE_ONESIGNAL_APP_ID?: string } }).env?.VITE_ONESIGNAL_APP_ID;
}

function loadScript(): Promise<void> {
  if (scriptLoaded || typeof document === 'undefined') return Promise.resolve();
  const w = window as unknown as { __onesignalScriptPromise?: Promise<void> };
  if (w.__onesignalScriptPromise) return w.__onesignalScriptPromise;

  const p = new Promise<void>((resolve, reject) => {
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
  w.__onesignalScriptPromise = p;
  return p;
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

/** Init once. Soft-asks permission after ~12s if not already decided. */
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
        serviceWorkerPath: '/OneSignalSDKWorker.js',
        serviceWorkerParam: { scope: '/' },
        promptOptions: {
          slidedown: {
            prompts: [
              {
                type: 'push',
                autoPrompt: false,
                text: {
                  actionMessage: 'Allow notifications so we can update you on orders and delivery.',
                  acceptButton: 'Allow',
                  cancelButton: 'Not now',
                },
                delay: { pageViews: 1, timeDelay: 12 },
              },
            ],
          },
        },
      });

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
                // dismissed
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
  } catch {
    initStarted = false;
  }
}

export async function linkOneSignalUser(userId: string | null | undefined) {
  if (!userId || !appId() || typeof window === 'undefined') return;
  try {
    await loadScript();
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        await OneSignal.login(String(userId));
        if (OneSignal.User?.PushSubscription?.optedIn) void onOptedIn();
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
