import { useState } from 'react';
import { money } from '@/lib/money';
import type { Order, Product, ResourceState } from '@/types';

async function api(url: string, init?: RequestInit) {
  const r = await fetch(url, { credentials: 'include', ...init });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b?.error || `Request failed (${r.status})`);
  return b;
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-white/10 bg-white/[.025] ${className}`}>{children}</div>;
}
function Pill({ value }: { value: string }) {
  return <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-bold capitalize">{String(value || '—').replaceAll('_', ' ')}</span>;
}
function Empty({ text }: { text: string }) {
  return <div className="py-10 text-center text-sm text-white/30">{text}</div>;
}
function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-3xl font-black tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-white/45">{subtitle}</p>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <div className="text-[11px] font-bold uppercase tracking-wider text-white/30">{label}</div>
      <div className="mt-3 text-2xl font-black">{value}</div>
    </Card>
  );
}
function Loading() {
  return <div className="grid min-h-[40vh] place-items-center text-white/40">Loading…</div>;
}

export function PaymentsBoard({ state, onRefresh }: { state: ResourceState<Order[]>; onRefresh?: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  if (state.state === 'loading') return <Loading />;
  if (state.state !== 'success') return <Empty text="No payment data." />;
  const pending = state.data.filter((x) => x.payment_status === 'pending_verification');
  const paid = state.data.filter((x) => x.payment_status === 'paid');

  const setPayment = async (order: Order, paymentStatus: 'paid' | 'rejected') => {
    setBusyId(order.id);
    setMsg('');
    try {
      await api('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          paymentStatus,
          status:
            paymentStatus === 'paid' && (order.status === 'awaiting_payment' || order.status === 'payment_verification')
              ? 'confirmed'
              : order.status,
        }),
      });
      setMsg(paymentStatus === 'paid' ? `Marked ${order.order_number} paid.` : `Rejected ${order.order_number}.`);
      onRefresh?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not update payment.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Header title="Payments" subtitle="Verify transfers and track paid volume." />
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Stat label="Pending verification" value={String(pending.length)} />
        <Stat label="Paid orders" value={String(paid.length)} />
        <Stat label="Paid volume" value={money(paid.reduce((n, x) => n + Number(x.total_kobo), 0))} />
      </div>
      {msg && <p className="mt-4 text-sm text-white/50">{msg}</p>}
      <Card className="mt-6 p-5">
        <b>Verification queue</b>
        <div className="mt-4 space-y-3">
          {pending.map((x) => (
            <div key={x.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 py-3">
              <span className="min-w-0">
                <b>{x.order_number}</b>
                <small className="block text-white/35">
                  {x.delivery_name} · {x.product_name}
                </small>
                {x.transfer_reference && <small className="block text-amber-200/80">Ref: {x.transfer_reference}</small>}
              </span>
              <div className="flex items-center gap-2">
                <b>{money(x.total_kobo)}</b>
                <button type="button" disabled={busyId === x.id} onClick={() => void setPayment(x, 'paid')} className="rounded-lg bg-emerald-500/90 px-3 py-1.5 text-xs font-bold disabled:opacity-50">
                  Mark paid
                </button>
                <button type="button" disabled={busyId === x.id} onClick={() => void setPayment(x, 'rejected')} className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-200 disabled:opacity-50">
                  Reject
                </button>
              </div>
            </div>
          ))}
          {!pending.length && <Empty text="No payments awaiting verification." />}
        </div>
      </Card>
    </>
  );
}

export function InventoryBoard({ products, onRefresh }: { products: Product[]; onRefresh: () => void }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'available' | 'low_stock' | 'out_of_stock'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const rows = products.filter((p) => {
    if (filter !== 'all' && p.stock_status !== filter) return false;
    if (q && !`${p.name} ${p.brand}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const setStock = async (p: Product, stockStatus: string) => {
    setBusyId(p.id);
    try {
      await api('/api/admin/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: p.id, stockStatus }),
      });
      onRefresh();
    } catch {
      /* ignore */
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Header title="Inventory" subtitle="Stock board — quick status without full product edit." />
      <div className="mt-6 flex flex-wrap gap-2">
        {(['all', 'available', 'low_stock', 'out_of_stock'] as const).map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${filter === f ? 'bg-vura-500' : 'border border-white/10 text-white/60'}`}>
            {f.replace('_', ' ')}
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="ml-auto rounded-xl border border-white/10 bg-white/[.035] px-3 py-1.5 text-sm outline-none" />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((p) => (
          <Card key={p.id} className="p-4">
            <div className="flex justify-between gap-2">
              <div className="min-w-0">
                <b className="block truncate">{p.name}</b>
                <small className="text-white/40">{p.brand}</small>
              </div>
              <Pill value={p.stock_status || '—'} />
            </div>
            <div className="mt-3 text-lg font-black">{money(p.price_kobo)}</div>
            <div className="mt-3 flex flex-wrap gap-1">
              {['available', 'low_stock', 'out_of_stock'].map((s) => (
                <button key={s} type="button" disabled={busyId === p.id || p.stock_status === s} onClick={() => void setStock(p, s)} className="rounded-md border border-white/10 px-2 py-1 text-[11px] font-bold capitalize disabled:opacity-40">
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </Card>
        ))}
      </div>
      {!rows.length && <Empty text="No products match this filter." />}
    </>
  );
}

export function SourcingBoard({ state, onRefresh }: { state: ResourceState<Order[]>; onRefresh?: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  if (state.state === 'loading') return <Loading />;
  if (state.state !== 'success') return <Empty text="No sourcing data." />;
  const rows = state.data.filter((x) => x.payment_status === 'paid' && !['delivered', 'cancelled', 'out_for_delivery'].includes(x.status));

  const advance = async (order: Order, status: string) => {
    setBusyId(order.id);
    try {
      await api('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, status, paymentStatus: order.payment_status, sourcingStatus: status }),
      });
      onRefresh?.();
    } catch {
      /* ignore */
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Header title="Sourcing" subtitle="Paid orders that still need buying or prep." />
      <Card className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr>
              {['Order', 'Customer', 'Product', 'Status', 'Total', ''].map((h) => (
                <th key={h} className="border-b border-white/10 px-4 py-3 text-left text-xs text-white/35">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.id} className="border-b border-white/5">
                <td className="px-4 py-3 font-bold">{x.order_number}</td>
                <td className="px-4">{x.delivery_name}</td>
                <td className="px-4">{x.product_name}</td>
                <td className="px-4">
                  <Pill value={x.sourcing_status || x.status} />
                </td>
                <td className="px-4 font-bold">{money(x.total_kobo)}</td>
                <td className="px-4">
                  <div className="flex gap-1">
                    <button type="button" disabled={busyId === x.id} onClick={() => void advance(x, 'sourcing')} className="rounded-md border border-white/10 px-2 py-1 text-[11px] font-bold">
                      Sourcing
                    </button>
                    <button type="button" disabled={busyId === x.id} onClick={() => void advance(x, 'purchased')} className="rounded-md border border-white/10 px-2 py-1 text-[11px] font-bold">
                      Purchased
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty text="No sourcing work queued." />}
      </Card>
    </>
  );
}

export function FulfillmentBoard({ state, onRefresh }: { state: ResourceState<Order[]>; onRefresh?: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  if (state.state === 'loading') return <Loading />;
  if (state.state !== 'success') return <Empty text="No fulfillment data." />;
  const ship = state.data.filter((x) => x.payment_status === 'paid' && (x.status === 'purchased' || x.status === 'out_for_delivery'));

  const setStatus = async (order: Order, status: string) => {
    setBusyId(order.id);
    try {
      await api('/api/admin/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, status, paymentStatus: 'paid', sourcingStatus: status }),
      });
      onRefresh?.();
    } catch {
      /* ignore */
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Header title="Fulfillment" subtitle="Purchased and out-for-delivery — get it to the customer." />
      <div className="mt-6 space-y-3">
        {ship.map((x) => (
          <Card key={x.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <b>{x.order_number}</b>
                <div className="mt-1 text-sm text-white/70">{x.product_name}</div>
                <div className="mt-2 text-sm text-white/45">
                  {x.delivery_name} · {x.delivery_phone}
                </div>
                <div className="mt-1 text-sm text-white/35">
                  {x.delivery_address}
                  {x.delivery_city ? `, ${x.delivery_city}` : ''}
                </div>
                <div className="mt-2">
                  <Pill value={x.status} />
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <b>{money(x.total_kobo)}</b>
                {x.status !== 'out_for_delivery' && (
                  <button type="button" disabled={busyId === x.id} onClick={() => void setStatus(x, 'out_for_delivery')} className="rounded-lg bg-vura-500 px-3 py-1.5 text-xs font-bold disabled:opacity-50">
                    Out for delivery
                  </button>
                )}
                <button type="button" disabled={busyId === x.id} onClick={() => void setStatus(x, 'delivered')} className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-200 disabled:opacity-50">
                  Mark delivered
                </button>
              </div>
            </div>
          </Card>
        ))}
        {!ship.length && <Empty text="Nothing to fulfill right now." />}
      </div>
    </>
  );
}
