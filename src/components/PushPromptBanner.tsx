import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { isPushSupported, requestPushPermission, getPushPermissionState } from '@/lib/onesignal';

const DISMISS_KEY = 'vura_push_banner_dismiss_v1';

/**
 * Visible banner so users can tap Allow (required on many browsers).
 * Auto browser prompts often never appear — especially on iPhone Safari.
 */
export default function PushPromptBanner() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      /* ignore */
    }

    if (!isPushSupported()) {
      // iOS Safari in a normal tab cannot do web push
      const ua = navigator.userAgent || '';
      const isIOS = /iPad|iPhone|iPod/.test(ua);
      if (isIOS) {
        setHint('On iPhone: Share → Add to Home Screen, open Vura from the icon, then enable alerts.');
        setVisible(true);
      }
      return;
    }

    void getPushPermissionState().then((state) => {
      if (state === 'granted' || state === 'denied') return;
      setVisible(true);
    });
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  const enable = async () => {
    setBusy(true);
    setHint('');
    try {
      const ok = await requestPushPermission();
      if (ok) {
        setVisible(false);
      } else {
        setHint('Permission not granted. Check browser site settings if you blocked notifications before.');
      }
    } catch {
      setHint('Could not open the permission dialog. Try again or check site settings.');
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[200] mx-auto max-w-md rounded-2xl border border-white/15 bg-[#12141f]/px-4 py-3 shadow-2xl backdrop-blur-md sm:left-auto">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-vura-500/20 text-vura-300">
          <Bell size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">Order alerts on your phone</p>
          <p className="mt-0.5 text-xs text-white/55">
            {hint || 'Get notified when orders and payments update. Tap Enable, then Allow.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {isPushSupported() && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void enable()}
                className="rounded-lg bg-vura-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              >
                {busy ? 'Opening…' : 'Enable'}
              </button>
            )}
            <button type="button" onClick={dismiss} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-bold text-white/70">
              Not now
            </button>
          </div>
        </div>
        <button type="button" onClick={dismiss} className="text-white/40 hover:text-white" aria-label="Dismiss">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
