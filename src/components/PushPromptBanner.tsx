import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { isPushSupported, requestPushPermission, getPushPermissionState, isIosSafariNotPwa } from '@/lib/onesignal';

const DISMISS_KEY = 'vura_push_banner_dismiss_v1';

export default function PushPromptBanner() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'enable' | 'ios-install' | 'error'>('enable');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      /* ignore */
    }

    if (isIosSafariNotPwa()) {
      setMode('ios-install');
      setMessage('On iPhone: tap Share → Add to Home Screen. Open Vura from the home icon, then you can allow alerts.');
      setVisible(true);
      return;
    }

    if (!isPushSupported()) return;

    void getPushPermissionState().then((state) => {
      if (state === 'granted' || state === 'denied') return;
      setMode('enable');
      setMessage('Get notified when orders and payments update.');
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
    setMessage('Waiting for permission…');
    try {
      const ok = await requestPushPermission();
      if (ok) {
        setVisible(false);
        return;
      }
      setMode('error');
      setMessage('Permission was not granted. If you blocked it earlier, clear site settings for this site and try again.');
    } catch {
      setMode('error');
      setMessage('Could not open the permission dialog. Try again in a few seconds.');
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-20 left-3 right-3 z-[300] mx-auto max-w-md sm:bottom-6 sm:left-auto sm:right-6"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-2xl shadow-black/20">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700">
            <Bell size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900">Order alerts on your phone</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-600">{message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {mode === 'enable' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void enable()}
                  className="rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-bold text-white disabled:opacity-60"
                >
                  {busy ? 'Waiting…' : 'Enable'}
                </button>
              )}
              <button
                type="button"
                onClick={dismiss}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2 text-xs font-bold text-gray-700"
              >
                {mode === 'ios-install' ? 'Got it' : 'Not now'}
              </button>
            </div>
          </div>
          <button type="button" onClick={dismiss} className="text-gray-400 hover:text-gray-700" aria-label="Dismiss">
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
