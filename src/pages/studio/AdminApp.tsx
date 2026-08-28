import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Zap, ShieldAlert, Menu } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import ProductionStudioOps from './ProductionStudioOps';
import FinanceView from './FinanceView';
import AdminSidebar from '@/components/AdminSidebar';
import AdminMobileDrawer from '@/components/AdminMobileDrawer';
import type { StudioTab } from '@/types';

const VALID_TABS: StudioTab[] = ['overview', 'health', 'orders', 'payments', 'products', 'inventory', 'sourcing', 'suppliers', 'delivery', 'customers', 'notifications', 'opportunities', 'agents', 'finance', 'analytics', 'audit', 'settings'];

function tabFromSearch(): StudioTab {
  try {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t && (VALID_TABS as string[]).includes(t)) return t as StudioTab;
  } catch {
    /* ignore */
  }
  return 'overview';
}

export default function AdminApp() {
  const { user, loading, signIn, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<StudioTab>(tabFromSearch);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  useEffect(() => {
    const onPop = () => setTab(tabFromSearch());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const onTabChange = (next: StudioTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.pushState({}, '', url.toString());
    setMobileDrawerOpen(false);
  };

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#080a12] text-white">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-vura-500">
            <Zap size={19} fill="currentColor" />
          </span>
          <span className="text-xl font-black">Vura Studio</span>
        </div>
      </div>
    );
  }

  if (!user) {
    const submit = async (e: FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError('');
      const res = await signIn(email, password);
      if (res.error) setError(res.error.message);
      setBusy(false);
    };
    return (
      <div className="grid min-h-screen place-items-center bg-[#080a12] px-4 text-white">
        <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[.03] p-6">
          <div className="mb-6 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-vura-500">
              <Zap size={19} fill="currentColor" />
            </span>
            <div>
              <b className="block">Vura Studio</b>
              <span className="text-xs text-white/40">Admin sign in</span>
            </div>
          </div>
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          <label className="block text-sm">
            <span className="text-xs text-white/45">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-[#111522] px-3 py-2.5 outline-none focus:border-vura-500"
            />
          </label>
          <label className="mt-3 block text-sm">
            <span className="text-xs text-white/45">Password</span>
            <div className="relative mt-1">
              <input
                type={show ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#111522] px-3 py-2.5 pr-10 outline-none focus:border-vura-500"
              />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-2.5 text-white/40">
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          <button type="submit" disabled={busy} className="mt-5 w-full rounded-xl bg-vura-500 py-3 font-bold disabled:opacity-50">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    );
  }

  if (user.role !== 'admin') {
    return (
      <div className="grid min-h-screen place-items-center bg-[#080a12] text-white">
        <div className="text-center">
          <p className="text-white/60">This account is not an admin.</p>
          <button type="button" onClick={() => void signOut()} className="mt-4 text-sm text-vura-300">
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#080a12] text-white">
      <AdminSidebar activeTab={tab} onTabChange={onTabChange} />
      <AdminMobileDrawer isOpen={mobileDrawerOpen} onClose={() => setMobileDrawerOpen(false)} activeTab={tab} onTabChange={onTabChange} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3 lg:hidden">
          <button type="button" onClick={() => setMobileDrawerOpen(true)} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10">
            <Menu size={18} />
          </button>
          <b className="flex-1">Vura Studio</b>
          <button type="button" onClick={() => void signOut()} className="text-xs text-white/45">
            Sign out
          </button>
        </div>
        {tab === 'finance' ? <FinanceView /> : <ProductionStudioOps tab={tab} onTabChange={onTabChange} />}
      </div>
    </div>
  );
}
