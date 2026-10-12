import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, ShieldAlert, Menu, Moon, Sun, Bell } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import ProductionStudioOps from './ProductionStudioOps';
import FinanceView from './FinanceView';
import AdminSidebar from '@/components/AdminSidebar';
import AdminMobileDrawer from '@/components/AdminMobileDrawer';
import type { StudioTab } from '@/types';

const VALID_TABS: StudioTab[] = [
  'overview', 'health', 'orders', 'payments', 'products', 'inventory',
  'sourcing', 'suppliers', 'delivery', 'customers', 'notifications',
  'opportunities', 'agents', 'finance', 'analytics', 'audit', 'settings',
];

const TAB_LABELS: Record<StudioTab, string> = {
  overview: 'Overview', health: 'Health & Alerts', orders: 'Orders',
  payments: 'Payments', products: 'Products', inventory: 'Inventory',
  sourcing: 'Sourcing', suppliers: 'Suppliers', delivery: 'Fulfillment',
  customers: 'Customers', notifications: 'Notifications',
  opportunities: 'Opportunities', agents: 'Command Center', finance: 'Finance',
  analytics: 'Analytics', audit: 'Audit log', settings: 'Settings',
};

function tabFromSearch(): StudioTab {
  try {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t && (VALID_TABS as string[]).includes(t)) return t as StudioTab;
  } catch { /* ignore */ }
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
  const [theme, setTheme] = useState<'dark' | 'light'>('light');

  useEffect(() => {
    const onPop = () => setTab(tabFromSearch());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('vura_admin_theme') as 'dark' | 'light' | null;
    const active = saved || 'light';
    setTheme(active);
    document.documentElement.setAttribute('data-theme', active);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('vura_admin_theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  const onTabChange = (next: StudioTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.pushState({}, '', url.toString());
    setMobileDrawerOpen(false);
  };

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--admin-bg)] text-[var(--admin-text-primary)]">
        <span className="font-display text-xl font-bold tracking-[0.18em] text-[var(--admin-sidebar-accent)]">VURA</span>
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
      <div className="grid min-h-screen place-items-center bg-[var(--admin-bg)] px-4 text-[var(--admin-text-primary)]">
        <form onSubmit={submit} className="admin-card w-full max-w-md p-6">
          <div className="mb-6">
            <span className="font-display text-2xl font-bold tracking-[0.18em] text-[var(--admin-sidebar-accent)]">VURA</span>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-[var(--admin-text-muted)]">Studio · Admin sign in</p>
          </div>
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-600">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
          <label className="block text-sm">
            <span className="text-xs font-semibold text-[var(--admin-text-muted)]">Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="admin-input mt-1" />
          </label>
          <label className="mt-3 block text-sm">
            <span className="text-xs font-semibold text-[var(--admin-text-muted)]">Password</span>
            <div className="relative mt-1">
              <input type={show ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} className="admin-input pr-10" />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-3 top-2.5 text-[var(--admin-text-muted)]">
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          <button type="submit" disabled={busy} className="mt-5 w-full rounded-lg bg-[var(--accent)] py-3 text-sm font-bold uppercase tracking-wider text-white transition hover:opacity-90 disabled:opacity-50">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    );
  }

  if (user.role !== 'admin') {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--admin-bg)] text-[var(--admin-text-primary)]">
        <div className="text-center">
          <p className="text-[var(--admin-text-secondary)]">This account is not an admin.</p>
          <button type="button" onClick={() => void signOut()} className="mt-4 text-sm font-semibold text-[var(--accent)]">Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell min-h-screen">
      <AdminSidebar activeTab={tab} onTabChange={onTabChange} onSignOut={() => void signOut()} />
      <AdminMobileDrawer isOpen={mobileDrawerOpen} onClose={() => setMobileDrawerOpen(false)} activeTab={tab} onTabChange={onTabChange} onSignOut={() => void signOut()} />

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 border-b border-[var(--admin-border)] bg-[var(--admin-card-bg)]/95 backdrop-blur-sm">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" onClick={() => setMobileDrawerOpen(true)} className="rounded-lg p-2 text-[var(--admin-text-secondary)] transition hover:bg-[var(--admin-table-row-hover)] hover:text-[var(--admin-text-primary)] lg:hidden" aria-label="Open menu">
                <Menu size={20} />
              </button>
              <h1 className="truncate font-display text-xl font-bold tracking-tight text-[var(--admin-text-primary)]">
                {TAB_LABELS[tab] || 'Dashboard'}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={toggleTheme} className="rounded-lg p-2.5 text-[var(--admin-text-secondary)] transition hover:bg-[var(--admin-table-row-hover)] hover:text-[var(--admin-text-primary)]" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button type="button" onClick={() => onTabChange('notifications')} className="relative rounded-lg p-2.5 text-[var(--admin-text-secondary)] transition hover:bg-[var(--admin-table-row-hover)] hover:text-[var(--admin-text-primary)]" aria-label="Notifications">
                <Bell size={18} />
              </button>
            </div>
          </div>
        </header>

        <main className="p-4 pb-24 sm:p-6 lg:p-8 lg:pb-8">
          {tab === 'finance' ? <FinanceView /> : <ProductionStudioOps tab={tab} onTabChange={onTabChange} />}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--admin-border)] bg-[var(--admin-card-bg)]/95 backdrop-blur lg:hidden" aria-label="Admin shortcuts">
        <div className="grid grid-cols-5">
          {([
            { id: 'overview' as StudioTab, label: 'Overview' },
            { id: 'orders' as StudioTab, label: 'Orders' },
            { id: 'products' as StudioTab, label: 'Products' },
            { id: 'customers' as StudioTab, label: 'Customers' },
            { id: 'settings' as StudioTab, label: 'Settings' },
          ] as const).map((item) => {
            const active = tab === item.id;
            return (
              <button key={item.id} type="button" onClick={() => onTabChange(item.id)} className={`flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-semibold ${active ? 'text-[#b0893e]' : 'text-[var(--admin-text-muted)]'}`}>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
