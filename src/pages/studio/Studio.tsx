import { useCallback, useEffect, useState } from 'react';
import {
  Home, Package, ShoppingBag, Store, Settings, Plus, Zap, RefreshCw,
  Check, X, Truck, CreditCard, AlertCircle, ChevronRight, Search,
} from 'lucide-react';
import { api } from '@/lib/api';
import { money } from '@/lib/money';
import type { Order, Product, Supplier, StudioTab } from '@/types';

type OverviewData = {
  liveProducts: number;
  monthlyOrders: number;
  monthlyRevenueKobo: number;
  monthlyProfitKobo: number;
};

const TABS: { id: StudioTab; label: string; icon: typeof Home }[] = [
  { id: 'overview', label: 'Overview', icon: Home },
  { id: 'orders', label: 'Orders', icon: ShoppingBag },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'suppliers', label: 'Suppliers', icon: Store },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Studio({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<StudioTab>('overview');

  return (
    <main className="min-h-screen bg-[#0d0e18] text-white">
      <div className="mx-auto grid max-w-[1600px] lg:grid-cols-[240px_1fr]">
        <aside className="hidden min-h-screen border-r border-white/10 bg-[#10111c] p-5 lg:block">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#5b35f5]">
              <Zap size={17} fill="currentColor" />
            </span>
            <div>
              <b className="text-[15px] tracking-[-.03em]">Vura Studio</b>
              <p className="text-[11px] font-medium text-white/40">Operations</p>
            </div>
          </div>

          <nav className="mt-8 space-y-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                  tab === id
                    ? 'bg-[#5b35f5] text-white shadow-lg shadow-[#5b35f5]/25'
                    : 'text-white/55 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon size={17} />
                {label}
              </button>
            ))}
          </nav>

          <button
            onClick={onBack}
            className="mt-10 flex w-full items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-sm font-semibold text-white/50 hover:bg-white/5 hover:text-white"
          >
            ← Back to storefront
          </button>
        </aside>

        <section className="min-h-screen p-4 md:p-8">
          <div className="mb-5 flex gap-2 overflow-x-auto pb-2 lg:hidden">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold ${
                  tab === id ? 'bg-[#5b35f5] text-white' : 'bg-white/5 text-white/60'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-white/35">Private operations</p>
              <h1 className="mt-1 text-3xl font-black tracking-[-.04em] capitalize">{tab}</h1>
            </div>
            {tab === 'products' && (
              <button className="inline-flex items-center gap-2 rounded-xl bg-[#5b35f5] px-4 py-2.5 text-sm font-bold shadow-lg shadow-[#5b35f5]/30">
                <Plus size={16} /> Add listing
              </button>
            )}
          </header>

          {tab === 'overview' && <OverviewPanel />}
          {tab === 'orders' && <OrdersPanel />}
          {tab === 'products' && <ProductsPanel />}
          {tab === 'suppliers' && <SuppliersPanel />}
          {tab === 'settings' && <SettingsPanel />}
        </section>
      </div>
    </main>
  );
}

function OverviewPanel() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .get<OverviewData>('/api/admin/overview')
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <StudioLoading />;
  if (error) return <StudioError message={error} onRetry={load} />;

  const cards = [
    { label: 'Monthly revenue', value: money(data?.monthlyRevenueKobo), hint: 'Paid orders this month' },
    { label: 'Gross profit', value: money(data?.monthlyProfitKobo), hint: 'After costs' },
    { label: 'Orders', value: String(data?.monthlyOrders ?? 0), hint: 'This month' },
    { label: 'Live products', value: String(data?.liveProducts ?? 0), hint: 'Active listings' },
  ];

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
            <p className="text-xs font-bold uppercase tracking-[.12em] text-white/40">{c.label}</p>
            <p className="mt-3 text-2xl font-black tracking-tight">{c.value}</p>
            <p className="mt-1 text-xs text-white/40">{c.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[.03] p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-black">Operations focus</h2>
            <button onClick={load} className="rounded-lg p-2 text-white/40 hover:bg-white/5 hover:text-white">
              <RefreshCw size={16} />
            </button>
          </div>
          <ul className="mt-5 space-y-3 text-sm text-white/70">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 grid h-6 w-6 place-items-center rounded-full bg-amber-500/20 text-amber-300">
                <CreditCard size={13} />
              </span>
              <div>
                <p className="font-semibold text-white">Verify pending payments</p>
                <p className="text-white/45">Confirm bank transfers so sourcing can start.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 grid h-6 w-6 place-items-center rounded-full bg-blue-500/20 text-blue-300">
                <Truck size={13} />
              </span>
              <div>
                <p className="font-semibold text-white">Advance sourcing status</p>
                <p className="text-white/45">Move paid orders through purchased → out for delivery.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 grid h-6 w-6 place-items-center rounded-full bg-emerald-500/20 text-emerald-300">
                <Package size={13} />
              </span>
              <div>
                <p className="font-semibold text-white">Keep stock truthful</p>
                <p className="text-white/45">Update stock_status when items move.</p>
              </div>
            </li>
          </ul>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[.03] p-6">
          <h2 className="font-black">Quick actions</h2>
          <p className="mt-4 text-sm text-white/50">
            Use the Orders tab to confirm payments and update fulfillment. All transitions are audited and notify the customer.
          </p>
        </div>
      </div>
    </div>
  );
}

function OrdersPanel() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api
      .get<{ orders: Order[] }>('/api/admin/orders')
      .then((d) => setOrders(d.orders || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateOrder = async (payload: Record<string, unknown>) => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.patch('/api/admin/orders', { orderId: selected.id, ...payload });
      await load();
      setSelected(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const filtered = orders.filter((o) => {
    if (filter === 'all') return true;
    if (filter === 'pending_payment') return o.payment_status === 'pending_verification' || o.payment_status === 'unpaid';
    if (filter === 'paid') return o.payment_status === 'paid';
    if (filter === 'sourcing') return ['sourcing', 'purchased', 'out_for_delivery'].includes(o.sourcing_status || o.status);
    return true;
  });

  if (loading) return <StudioLoading />;
  if (error) return <StudioError message={error} onRetry={load} />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ['all', 'All'],
          ['pending_payment', 'Needs payment'],
          ['paid', 'Paid'],
          ['sourcing', 'In fulfillment'],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${
              filter === k ? 'bg-[#5b35f5] text-white' : 'bg-white/5 text-white/55 hover:bg-white/10'
            }`}
          >
            {label}
          </button>
        ))}
        <button onClick={load} className="ml-auto rounded-lg p-2 text-white/40 hover:bg-white/5">
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[.04] text-xs uppercase tracking-wider text-white/40">
            <tr>
              <th className="px-4 py-3 font-semibold">Order</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">Customer</th>
              <th className="px-4 py-3 font-semibold">Total</th>
              <th className="hidden px-4 py-3 font-semibold lg:table-cell">Payment</th>
              <th className="hidden px-4 py-3 font-semibold xl:table-cell">Sourcing</th>
              <th className="px-4 py-3 font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-white/40">
                  No orders match this filter.
                </td>
              </tr>
            ) : (
              filtered.map((o) => (
                <tr
                  key={o.id}
                  className="border-t border-white/5 hover:bg-white/[.03] cursor-pointer"
                  onClick={() => setSelected(o)}
                >
                  <td className="px-4 py-3">
                    <p className="font-bold text-white">{o.order_number || o.id.slice(0, 8)}</p>
                    <p className="text-xs text-white/45">{o.product_name}</p>
                  </td>
                  <td className="hidden px-4 py-3 text-white/70 md:table-cell">{o.buyer_email || o.delivery_name}</td>
                  <td className="px-4 py-3 font-semibold">{money(o.total_kobo)}</td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    <StatusPill value={o.payment_status} />
                  </td>
                  <td className="hidden px-4 py-3 xl:table-cell">
                    <StatusPill value={o.sourcing_status || o.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight size={16} className="inline text-white/30" />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setSelected(null)}>
          <div
            className="h-full w-full max-w-lg overflow-y-auto border-l border-white/10 bg-[#12131f] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-white/40">Order detail</p>
                <h2 className="mt-1 text-xl font-black">{selected.order_number}</h2>
              </div>
              <button onClick={() => setSelected(null)} className="rounded-lg p-2 hover:bg-white/5">
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 space-y-4 text-sm">
              <Row label="Product" value={`${selected.brand} — ${selected.product_name}`} />
              <Row label="Qty" value={String(selected.quantity)} />
              <Row label="Total" value={money(selected.total_kobo)} />
              <Row label="Customer" value={selected.delivery_name} />
              <Row label="Phone" value={selected.delivery_phone} />
              <Row label="Address" value={`${selected.delivery_address}, ${selected.delivery_city}`} />
              <Row label="Email" value={selected.buyer_email || '—'} />
              <Row label="Transfer ref" value={selected.transfer_reference || '—'} />
              <Row label="Payment" value={<StatusPill value={selected.payment_status} />} />
              <Row label="Status" value={<StatusPill value={selected.status} />} />
              <Row label="Sourcing" value={<StatusPill value={selected.sourcing_status || '—'} />} />
              {selected.actual_profit_kobo != null && (
                <Row label="Profit" value={money(selected.actual_profit_kobo)} />
              )}
            </div>

            <div className="mt-8 space-y-3 border-t border-white/10 pt-6">
              <p className="text-xs font-bold uppercase tracking-wider text-white/40">Actions</p>

              {(selected.payment_status === 'pending_verification' || selected.payment_status === 'unpaid') && (
                <div className="flex gap-2">
                  <button
                    disabled={busy}
                    onClick={() => updateOrder({ paymentStatus: 'paid', status: 'confirmed' })}
                    className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold disabled:opacity-50"
                  >
                    <Check size={15} className="mr-1 inline" /> Mark paid
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => updateOrder({ paymentStatus: 'rejected' })}
                    className="flex-1 rounded-xl bg-red-600/80 py-2.5 text-sm font-bold disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}

              {selected.payment_status === 'paid' && (
                <div className="grid grid-cols-2 gap-2">
                  <ActionBtn disabled={busy} onClick={() => updateOrder({ sourcingStatus: 'sourcing', status: 'sourcing' })}>
                    Start sourcing
                  </ActionBtn>
                  <ActionBtn disabled={busy} onClick={() => updateOrder({ sourcingStatus: 'purchased', status: 'purchased' })}>
                    Mark purchased
                  </ActionBtn>
                  <ActionBtn disabled={busy} onClick={() => updateOrder({ sourcingStatus: 'out_for_delivery', status: 'out_for_delivery' })}>
                    Out for delivery
                  </ActionBtn>
                  <ActionBtn disabled={busy} onClick={() => updateOrder({ sourcingStatus: 'delivered', status: 'delivered' })}>
                    Mark delivered
                  </ActionBtn>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductsPanel() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<{ products: Product[] }>('/api/admin/products')
      .then((d) => setProducts(d.products || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = products.filter(
    (p) =>
      !q ||
      p.name.toLowerCase().includes(q.toLowerCase()) ||
      p.brand.toLowerCase().includes(q.toLowerCase())
  );

  if (loading) return <StudioLoading />;
  if (error) return <StudioError message={error} onRetry={load} />;

  return (
    <div>
      <div className="mb-4 flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products…"
            className="w-full rounded-xl border border-white/10 bg-white/5 py-2.5 pl-10 pr-4 text-sm outline-none placeholder:text-white/30 focus:border-[#5b35f5]"
          />
        </div>
        <button onClick={load} className="rounded-xl border border-white/10 px-3 text-white/50 hover:bg-white/5">
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/[.04] text-xs uppercase tracking-wider text-white/40">
            <tr>
              <th className="px-4 py-3 font-semibold">Product</th>
              <th className="px-4 py-3 font-semibold">Retail</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">Cost</th>
              <th className="hidden px-4 py-3 font-semibold lg:table-cell">Stock</th>
              <th className="px-4 py-3 font-semibold">Active</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-white/5 hover:bg-white/[.03]">
                <td className="px-4 py-3">
                  <p className="font-bold">{p.brand}</p>
                  <p className="text-xs text-white/50">{p.name}</p>
                </td>
                <td className="px-4 py-3 font-semibold">{money(p.price_kobo)}</td>
                <td className="hidden px-4 py-3 text-white/60 md:table-cell">
                  {p.source_price_kobo != null ? money(p.source_price_kobo) : '—'}
                </td>
                <td className="hidden px-4 py-3 lg:table-cell">
                  <StatusPill value={p.stock_status} />
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-bold ${p.is_active !== false ? 'text-emerald-400' : 'text-white/30'}`}>
                    {p.is_active !== false ? 'Yes' : 'No'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SuppliersPanel() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<{ suppliers: Supplier[] }>('/api/admin/suppliers')
      .then((d) => setSuppliers(d.suppliers || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/api/admin/suppliers', { name, location, phone, notes });
      setName('');
      setLocation('');
      setPhone('');
      setNotes('');
      setShowForm(false);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <StudioLoading />;
  if (error) return <StudioError message={error} onRetry={load} />;

  return (
    <div>
      <div className="mb-4 flex justify-between">
        <p className="text-sm text-white/50">{suppliers.length} suppliers</p>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#5b35f5] px-4 py-2 text-sm font-bold"
        >
          <Plus size={15} /> Add supplier
        </button>
      </div>

      {showForm && (
        <form onSubmit={create} className="mb-6 grid gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-5 sm:grid-cols-2">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Supplier name"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-[#5b35f5]"
          />
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-[#5b35f5]"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-[#5b35f5]"
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-[#5b35f5]"
          />
          <button
            disabled={busy}
            className="rounded-xl bg-[#5b35f5] py-2.5 text-sm font-bold disabled:opacity-50 sm:col-span-2"
          >
            {busy ? 'Saving…' : 'Save supplier'}
          </button>
        </form>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {suppliers.map((s) => (
          <div key={s.id} className="rounded-2xl border border-white/10 bg-white/[.03] p-5">
            <p className="font-black">{s.name}</p>
            <p className="mt-1 text-sm text-white/50">{s.location || 'No location'}</p>
            <p className="mt-1 text-sm text-white/50">{s.phone || 'No phone'}</p>
            {s.notes && <p className="mt-2 text-xs text-white/35 line-clamp-2">{s.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsPanel() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[.03] p-6">
      <h2 className="font-black">Platform settings</h2>
      <p className="mt-2 text-sm text-white/50">
        Payout account details are stored server-side in <code className="text-[#a78bfa]">platform_settings</code>.
        Update them via the database or a future settings API. Never hard-code bank details in the client.
      </p>
      <ul className="mt-5 space-y-2 text-sm text-white/60">
        <li>• Account name: Vura Tech Hub</li>
        <li>• Bank: VFD Microfinance Bank</li>
        <li>• Payment method: bank transfer</li>
      </ul>
    </div>
  );
}

function StudioLoading() {
  return (
    <div className="flex h-48 items-center justify-center text-white/40">
      <RefreshCw size={20} className="animate-spin" />
    </div>
  );
}

function StudioError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
      <AlertCircle className="mx-auto text-red-400" size={24} />
      <p className="mt-3 font-semibold text-red-200">{message}</p>
      <button onClick={onRetry} className="mt-4 rounded-xl bg-white/10 px-4 py-2 text-sm font-bold">
        Retry
      </button>
    </div>
  );
}

function StatusPill({ value }: { value: string }) {
  const v = (value || '').toLowerCase();
  let color = 'bg-white/10 text-white/60';
  if (['paid', 'delivered', 'confirmed', 'available'].includes(v)) color = 'bg-emerald-500/20 text-emerald-300';
  if (['pending_verification', 'sourcing', 'purchased', 'out_for_delivery'].includes(v)) color = 'bg-amber-500/20 text-amber-300';
  if (['unpaid', 'rejected', 'cancelled', 'sold_out'].includes(v)) color = 'bg-red-500/20 text-red-300';
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold capitalize ${color}`}>
      {value?.replaceAll('_', ' ') || '—'}
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/5 py-2">
      <span className="text-white/40">{label}</span>
      <span className="text-right font-medium text-white">{value}</span>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="rounded-xl border border-white/15 bg-white/5 py-2.5 text-xs font-bold hover:bg-white/10 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
