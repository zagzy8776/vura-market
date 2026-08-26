import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, AlertTriangle, RefreshCw, ShieldCheck, Wallet } from 'lucide-react';
import { money } from '@/lib/money';
import type { Overview, ResourceState, StudioTab } from '@/types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-3xl font-black tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-white/45">{subtitle}</p>
    </div>
  );
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-white/10 bg-white/[.025] ${className}`}>{children}</div>;
}

function BarList({ items }: { items: Array<{ label: string; value: number; hint?: string }> }) {
  const max = Math.max(...items.map((x) => x.value), 1);
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <span className="truncate capitalize text-white/70">{item.label.replaceAll('_', ' ')}</span>
            <span className="shrink-0 text-white/45">{item.hint || item.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-vura-500" style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
      {!items.length && <div className="py-8 text-center text-sm text-white/30">No data yet.</div>}
    </div>
  );
}

export function HealthBoard({ overview, onNavigate }: { overview: ResourceState<Overview>; onNavigate: (tab: StudioTab) => void }) {
  const [health, setHealth] = useState<{ status?: string; database?: { connected?: boolean; responseTimeMs?: number }; error?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setHealth(await request('/api/admin/health'));
    } catch (e) {
      setHealth({ status: 'down', error: e instanceof Error ? e.message : 'Health check failed' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const attention = overview.state === 'success' ? overview.data.attention : undefined;
  const ok = health?.status === 'healthy' && health.database?.connected;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Header title="Health & Alerts" subtitle="Database, queue pressure, and the work that should not wait." />
        <button type="button" onClick={() => void load()} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10" aria-label="Refresh health">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/30">
            <ShieldCheck size={14} /> System
          </div>
          <div className={`mt-3 text-2xl font-black ${ok ? 'text-emerald-300' : 'text-amber-200'}`}>{ok ? 'Healthy' : loading ? 'Checking…' : 'Attention'}</div>
          <p className="mt-1 text-xs text-white/40">
            {health?.database?.connected ? `DB ${health.database.responseTimeMs ?? '—'}ms` : health?.error || 'Could not reach health endpoint'}
          </p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/30">
            <Wallet size={14} /> Payments waiting
          </div>
          <div className="mt-3 text-2xl font-black">{attention?.pendingPayment ?? '—'}</div>
          <button type="button" onClick={() => onNavigate('payments')} className="mt-2 text-xs font-bold text-vura-300">
            Open payments
          </button>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/30">
            <AlertTriangle size={14} /> To fulfill / low stock
          </div>
          <div className="mt-3 text-2xl font-black">
            {attention ? `${attention.toFulfill} / ${attention.lowStock}` : '—'}
          </div>
          <div className="mt-2 flex gap-3 text-xs font-bold text-vura-300">
            <button type="button" onClick={() => onNavigate('delivery')}>Fulfillment</button>
            <button type="button" onClick={() => onNavigate('inventory')}>Inventory</button>
          </div>
        </Card>
      </div>
      <Card className="mt-6 p-5">
        <b>What this page watches</b>
        <ul className="mt-3 space-y-2 text-sm text-white/55">
          <li>Neon database ping from the admin health endpoint.</li>
          <li>Unpaid / pending transfers that block sourcing.</li>
          <li>Paid orders not yet delivered, and products marked low or out of stock.</li>
        </ul>
      </Card>
    </>
  );
}

type AnalyticsPayload = {
  daily: Array<{ label: string; orders: number; revenue_kobo: number }>;
  statuses: Array<{ status: string; count: number }>;
  payments: Array<{ payment_status: string; count: number }>;
  topProducts: Array<{ name: string; orders: number; revenue_kobo: number }>;
  searches: Array<{ query: string; count: number }>;
};

export function AnalyticsBoard() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await request<AnalyticsPayload>('/api/admin/analytics'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const orderMax = useMemo(() => Math.max(...(data?.daily.map((d) => d.orders) || [0]), 1), [data]);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Header title="Analytics" subtitle="Last 14 days of orders, mix, and what people search for." />
        <button type="button" onClick={() => void load()} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10" aria-label="Refresh analytics">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      {error && <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{error}</div>}
      {loading && !data ? (
        <div className="grid min-h-[40vh] place-items-center text-white/40">Loading analytics…</div>
      ) : (
        <>
          <Card className="mt-6 p-5">
            <b>Orders — last 14 days</b>
            <div className="mt-5 flex h-40 items-end gap-1.5">
              {(data?.daily || []).map((d) => (
                <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div className="w-full rounded-t bg-vura-500/90" style={{ height: `${Math.max(6, (d.orders / orderMax) * 100)}%` }} title={`${d.label}: ${d.orders} orders`} />
                  <span className="hidden text-[10px] text-white/30 sm:block">{d.label}</span>
                </div>
              ))}
              {!data?.daily.length && <div className="w-full py-10 text-center text-sm text-white/30">No orders in this window.</div>}
            </div>
          </Card>
          <div className="mt-6 grid gap-5 xl:grid-cols-2">
            <Card className="p-5">
              <b>Order status mix</b>
              <div className="mt-4">
                <BarList items={(data?.statuses || []).map((x) => ({ label: x.status, value: x.count }))} />
              </div>
            </Card>
            <Card className="p-5">
              <b>Payment mix</b>
              <div className="mt-4">
                <BarList items={(data?.payments || []).map((x) => ({ label: x.payment_status, value: x.count }))} />
              </div>
            </Card>
            <Card className="p-5">
              <b>Top products</b>
              <div className="mt-4">
                <BarList
                  items={(data?.topProducts || []).map((x) => ({
                    label: x.name,
                    value: Number(x.revenue_kobo || 0),
                    hint: `${x.orders} \u00b7 ${money(x.revenue_kobo)}`,
                  }))}
                />
              </div>
            </Card>
            <Card className="p-5">
              <b>Trending searches</b>
              <div className="mt-4">
                <BarList items={(data?.searches || []).map((x) => ({ label: x.query, value: x.count }))} />
              </div>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

const SETTING_FIELDS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'store_name', label: 'Store name', hint: 'Shown internally in Studio' },
  { key: 'payout_account_name', label: 'Payout account name', hint: 'Shown to customers at checkout' },
  { key: 'payout_account_number', label: 'Payout account number', hint: 'Bank transfer destination' },
  { key: 'payout_bank_name', label: 'Bank name', hint: 'e.g. VFD Microfinance Bank' },
  { key: 'payment_method', label: 'Payment method', hint: 'Usually bank_transfer' },
  { key: 'support_phone', label: 'Support phone', hint: 'Used for Call from Studio and customer help' },
  { key: 'support_whatsapp', label: 'Support WhatsApp', hint: '080\u2026 or +234\u2026 \u2014 customer help link' },
];

export function SettingsBoard() {
  const [form, setForm] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await request<{ settings: Record<string, string> }>('/api/admin/settings');
      setForm(data.settings || {});
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not load settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      const payload = Object.fromEntries(SETTING_FIELDS.map((f) => [f.key, form[f.key] || '']));
      const data = await request<{ settings: Record<string, string> }>('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setForm(data.settings || payload);
      setMsg('Settings saved. Checkout will use the new payout account.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Header title="Settings" subtitle="Payout account and the WhatsApp number customers reach you on." />
      {loading ? (
        <div className="grid min-h-[30vh] place-items-center text-white/40">Loading settings\u2026</div>
      ) : (
        <Card className="mt-6 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            {SETTING_FIELDS.map((field) => (
              <label key={field.key} className="block text-sm">
                <span className="mb-1.5 block text-xs font-semibold text-white/45">{field.label}</span>
                <input
                  value={form[field.key] || ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  className="w-full rounded-[10px] border border-white/10 bg-[#111522] px-3 py-2.5 outline-none focus:border-vura-500"
                />
                <span className="mt-1 block text-[11px] text-white/30">{field.hint}</span>
              </label>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" disabled={saving} onClick={() => void save()} className="rounded-xl bg-vura-500 px-4 py-2.5 text-sm font-bold disabled:opacity-50">
              {saving ? 'Saving\u2026' : 'Save settings'}
            </button>
            {msg && <span className="text-sm text-white/50">{msg}</span>}
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs text-white/35">
            <Activity size={13} /> Changes are written to platform_settings and recorded in the audit log.
          </p>
        </Card>
      )}
    </>
  );
}
