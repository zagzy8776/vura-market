import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity, AlertTriangle, Bell, ChevronRight, CreditCard, LayoutDashboard,
  Package, RefreshCw, Search, ShieldCheck, ShoppingBag, Store, UserRound, X,
} from 'lucide-react';
import { money } from '@/lib/money';
import type {
  Audit, Customer, Notification, Order, OrderEvent, Overview, Product, StudioTab, Supplier,
} from '@/types';

const date = (v?: string | null) => v ? new Date(v).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const pretty = (v: string) => v.replaceAll('_', ' ');

const nav: Array<{ id: StudioTab; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'orders', label: 'Orders', icon: ShoppingBag },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'sourcing', label: 'Sourcing', icon: Store },
  { id: 'suppliers', label: 'Suppliers', icon: Store },
  { id: 'customers', label: 'Customers', icon: UserRound },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'audit', label: 'Audit log', icon: Activity },
];

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

export default function ProductionStudio() {
  const [tab, setTab] = useState<StudioTab>('overview');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<{
    overview: Overview | null; orders: Order[]; products: Product[]; suppliers: Supplier[]; notifications: Notification[];
  }>({ overview: null, orders: [], products: [], suppliers: [], notifications: [] });

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [overview, orders, products, suppliers, notifications] = await Promise.all([
        request<Overview>('/api/admin/overview'),
        request<{ orders: Order[] }>('/api/admin/orders'),
        request<{ products: Product[] }>('/api/admin/products'),
        request<{ suppliers: Supplier[] }>('/api/admin/suppliers'),
        request<{ notifications: Notification[] }>('/api/admin/notifications'),
      ]);
      setData({ overview, orders: orders.orders || [], products: products.products || [], suppliers: suppliers.suppliers || [], notifications: notifications.notifications || [] });
    } catch (e) { setError(e instanceof Error ? e.message : 'Studio data could not be loaded.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const filteredOrders = useMemo(() => data.orders.filter(o => `${o.order_number || ''} ${o.delivery_name} ${o.buyer_email || ''} ${o.product_name} ${o.delivery_phone}`.toLowerCase().includes(query.toLowerCase())), [data.orders, query]);
  const filteredProducts = useMemo(() => data.products.filter(p => `${p.name} ${p.brand} ${p.category || ''} ${p.supplier_name || ''}`.toLowerCase().includes(query.toLowerCase())), [data.products, query]);
  const filteredSuppliers = useMemo(() => data.suppliers.filter(s => `${s.name} ${s.location || ''} ${s.phone || ''}`.toLowerCase().includes(query.toLowerCase())), [data.suppliers, query]);
  const filteredCustomers = useMemo(() => (data.overview?.customers || []).filter(c => `${c.name} ${c.email}`.toLowerCase().includes(query.toLowerCase())), [data.overview?.customers, query]);

  return <main className="min-h-screen bg-[#080a12] text-white">
    <div className="mx-auto flex min-h-screen max-w-[1800px]">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-[#0b0d17] p-4 lg:flex">
        <div className="flex items-center gap-3 px-2 py-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-vura-500 shadow-lg shadow-[#6a4cff]/25"><span className="text-lg font-black">V</span></span>
          <div><div className="font-black tracking-tight">Vura Studio</div><div className="text-[11px] text-white/35">Commerce operating system</div></div>
        </div>
        <div className="mt-6 flex-1 space-y-1 overflow-y-auto">{nav.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${tab === item.id ? 'bg-vura-500 text-white shadow-lg shadow-[#6a4cff]/25' : 'text-white/55 hover:bg-white/5 hover:text-white'}`}><Icon size={16}/>{item.label}</button>; })}</div>
        <div className="border-t border-white/10 pt-3 text-xs text-white/35"><div className="flex items-center gap-2"><ShieldCheck size={14}/> Server-authorized workspace</div></div>
      </aside>

      <section className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 border-b border-white/10 bg-[#080a12]/90 backdrop-blur-xl">
          <div className="flex h-[72px] items-center gap-3 px-5 md:px-8">
            <div className="lg:hidden flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-lg bg-vura-500 font-black">V</span><b>Studio</b></div>
            <div className="relative max-w-2xl min-w-0 flex-1"><Search className="absolute left-3.5 top-3.5 text-white/30" size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search orders, products, customers, suppliers…" className="w-full rounded-xl border border-white/10 bg-white/[.035] py-3 pl-10 pr-4 text-sm outline-none focus:border-vura-400"/></div>
            <button onClick={() => void load()} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-white/55 hover:bg-white/5" aria-label="Refresh"><RefreshCw size={17} className={loading ? 'animate-spin' : ''}/></button>
            <div className="hidden md:flex items-center gap-3"><div className="text-right"><div className="text-sm font-bold">Vura Admin</div><div className="text-[11px] text-white/35">Owner workspace</div></div><span className="grid h-10 w-10 place-items-center rounded-full bg-vura-500/15 text-vura-200"><UserRound size={18}/></span></div>
          </div>
          <div className="flex gap-2 overflow-x-auto px-5 pb-3 lg:hidden">{nav.map(item => <button key={item.id} onClick={() => setTab(item.id)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold ${tab === item.id ? 'bg-vura-500' : 'bg-white/5 text-white/55'}`}>{item.label}</button>)}</div>
        </header>

        <div className="p-5 md:p-8">
          {error && <div className="mb-5 flex items-center gap-3 border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200"><AlertTriangle size={17}/><span className="flex-1">{error}</span><button onClick={() => setError('')}><X size={16}/></button></div>}
          {loading && !data.overview ? <Loading/> : <>
            {tab === 'overview' && <OverviewView data={data} onTab={setTab}/>}
            {tab === 'orders' && <OrdersView orders={filteredOrders} onRefresh={load}/>}
            {tab === 'payments' && <PaymentsView orders={data.orders}/>}
            {tab === 'products' && <ProductsView products={filteredProducts} onRefresh={load}/>}
            {tab === 'sourcing' && <SourcingView orders={data.orders}/>}
            {tab === 'suppliers' && <SuppliersView suppliers={filteredSuppliers} onRefresh={load}/>}
            {tab === 'customers' && <CustomersView customers={filteredCustomers}/>}
            {tab === 'notifications' && <NotificationsView items={data.notifications}/>}
            {tab === 'audit' && <AuditView items={data.overview?.audit || []} orderEvents={data.overview?.orderEvents || []}/>}
          </>}
        </div>
      </section>
    </div>
  </main>;
}

function OverviewView({ data, onTab }: { data: { overview: Overview | null; notifications: Notification[] }; onTab: (t: StudioTab) => void }) {
  const o = data.overview;
  if (!o) return <Empty text="No overview data yet."/>;
  const pending = data.notifications.length;
  return <div>
    <Header title="Overview" subtitle="A live view of catalog, revenue, sourcing, and recent admin activity."/>
    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Stat label="Live products" value={String(o.liveProducts)}/>
      <Stat label="Orders this month" value={String(o.monthlyOrders)}/>
      <Stat label="Revenue this month" value={money(o.monthlyRevenueKobo)}/>
      <Stat label="Profit this month" value={money(o.monthlyProfitKobo)}/>
    </div>
    <div className="mt-6 grid gap-5 xl:grid-cols-3">
      <Card className="p-5 xl:col-span-2">
        <div className="flex items-center justify-between">
          <div className="font-black">Recent activity</div>
          <button onClick={() => onTab('audit')} className="text-xs font-semibold text-vura-300">View audit log →</button>
        </div>
        <div className="mt-4 divide-y divide-white/5">{(o.audit || []).slice(0, 6).map(a => <div key={a.id} className="flex items-center gap-3 py-2.5"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-vura-300"><Activity size={14}/></span><div className="min-w-0 flex-1"><div className="truncate text-sm"><b>{a.actor_name || 'System'}</b> · {a.action} {a.entity_type}{a.entity_id ? ` #${a.entity_id}` : ''}</div><div className="text-xs text-white/35">{date(a.created_at)}</div></div></div>)}{!o.audit?.length && <Empty text="No admin activity recorded yet."/>}</div>
      </Card>
      <Card className="p-5">
        <div className="font-black">Notifications</div>
        <div className="mt-4 space-y-2">
          <ClickMetric label="Pending payment verifications" value={String(pending)} onClick={() => onTab('notifications')}/>
          <ClickMetric label="Recent audit events" value={String((o.audit || []).length)} onClick={() => onTab('audit')}/>
          <ClickMetric label="Recent order events" value={String((o.orderEvents || []).length)} onClick={() => onTab('audit')}/>
        </div>
      </Card>
    </div>
  </div>;
}

function OrdersView({ orders }: { orders: Order[]; onRefresh: () => void }) {
  return <div>
    <Header title="Orders" subtitle="Every order placed on Vura. Search by customer, product, or order number."/>
    <div className="mt-5"><Table headers={['Order','Customer','Product','Payment','Sourcing','Total']} rows={orders.map(o => [<b>{o.order_number}</b>,<div>{o.delivery_name}<small className="block text-white/35">{o.delivery_phone}</small></div>,<div>{o.product_name}<small className="block text-white/35">{o.brand}</small></div>,<Pill value={o.payment_status}/>,<Pill value={o.sourcing_status || o.status}/>,<b>{money(o.total_kobo)}</b>])}/></div>
  </div>;
}

function PaymentsView({ orders }: { orders: Order[] }) {
  const needsVerification = orders.filter(o => o.payment_status === 'pending_verification');
  const paid = orders.filter(o => o.payment_status === 'paid');
  return <div>
    <Header title="Payments" subtitle="Verify transfers, audit rejected payments, and track paid orders."/>
    <div className="mt-5 grid gap-4 md:grid-cols-3"><Stat label="Awaiting verification" value={String(needsVerification.length)}/><Stat label="Paid" value={String(paid.length)}/><Stat label="Total paid" value={money(paid.reduce((a, o) => a + Number(o.total_kobo), 0))}/></div>
    <div className="mt-6"><Card className="p-5"><div className="font-black">Awaiting verification</div><div className="mt-4 space-y-2">{needsVerification.map(o => <div key={o.id} className="flex items-center justify-between border-b border-white/5 py-2"><div><b>{o.order_number}</b><small className="block text-white/35">{o.delivery_name} · {money(o.total_kobo)}</small></div><Pill value={o.payment_status}/></div>)}{!needsVerification.length && <Empty text="No payments waiting for verification."/>}</div></Card></div>
  </div>;
}

function ProductsView({ products }: { products: Product[]; onRefresh: () => void }) {
  return <div>
    <Header title="Products" subtitle="The full catalog including inactive items."/>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map(p => <Card key={p.id} className="overflow-hidden">
        {p.images?.[0] ? <img src={p.images[0]} alt={p.name} className="aspect-[4/3] w-full object-cover"/> : <div className="grid aspect-[4/3] w-full place-items-center bg-white/5 text-white/30"><Package size={28}/></div>}
        <div className="p-4">
          <div className="line-clamp-1 font-bold">{p.name}</div>
          <div className="text-xs text-white/40">{p.brand}{p.category ? ` · ${p.category}` : ''}</div>
          <div className="mt-3 flex items-center justify-between"><b>{money(p.price_kobo)}</b><Pill value={p.stock_status}/></div>
        </div>
      </Card>)}
      {!products.length && <div className="col-span-full"><Empty text="No products yet."/></div>}
    </div>
  </div>;
}

function SourcingView({ orders }: { orders: Order[] }) {
  const sourcing = orders.filter(o => o.payment_status === 'paid' && !['delivered','cancelled'].includes(o.status));
  return <div>
    <Header title="Sourcing" subtitle="Paid orders that still need purchasing and dispatch."/>
    <div className="mt-5"><Table headers={['Order','Customer','Product','Sourcing','Total']} rows={sourcing.map(o => [<b>{o.order_number}</b>,o.delivery_name,<div>{o.product_name}<small className="block text-white/35">{o.supplier_name || 'Supplier not assigned'}</small></div>,<Pill value={o.sourcing_status || o.status}/>,<b>{money(o.total_kobo)}</b>])}/></div>
  </div>;
}

function SuppliersView({ suppliers }: { suppliers: Supplier[]; onRefresh: () => void }) {
  return <div>
    <Header title="Suppliers" subtitle="Sources for sourcing, including reliability notes."/>
    <div className="mt-5"><Table headers={['Name','Location','Phone','Notes']} rows={suppliers.map(s => [<b>{s.name}</b>,s.location || '—',s.phone || '—',<span className="line-clamp-2 max-w-xs">{s.notes || '—'}</span>])}/></div>
  </div>;
}

function CustomersView({ customers }: { customers: Customer[] }) {
  return <div>
    <Header title="Customers" subtitle="Accounts that have placed at least one order."/>
    <div className="mt-5"><Table headers={['Customer','Email','Orders','Lifetime spend']} rows={customers.map(c => [<b>{c.name}</b>,c.email,String(c.order_count),<b>{money(c.total_spend_kobo)}</b>])}/></div>
  </div>;
}

function NotificationsView({ items }: { items: Notification[] }) {
  return <div>
    <Header title="Notifications" subtitle="System-generated alerts for admins and customers."/>
    <div className="mt-5 space-y-2">{items.map(n => <Card key={n.id} className="p-4"><div className="flex items-center justify-between"><b>{n.title}</b><small className="text-white/30">{date(n.created_at)}</small></div><div className="mt-1 text-sm text-white/55">{n.body}</div>{n.user_email && <small className="mt-2 block text-xs text-white/30">For: {n.user_email}{n.order_number ? ` · ${n.order_number}` : ''}</small>}</Card>)}{!items.length && <Empty text="No notifications."/>}</div>
  </div>;
}

function AuditView({ items, orderEvents }: { items: Audit[]; orderEvents: OrderEvent[] }) {
  return <div>
    <Header title="Audit log" subtitle="Administrative changes recorded with actor, entity, and before/after state."/>
    <div className="mt-5"><Card className="p-5"><div className="font-black">Audit log</div><div className="mt-4 space-y-2">{items.map(a => <div key={a.id} className="border-b border-white/5 py-2 text-sm"><div className="flex items-center gap-3"><span className="text-xs text-white/40">{date(a.created_at)}</span><b>{a.actor_name || 'System'}</b><span className="text-white/30">{a.actor_email || ''}</span></div><div>{a.action} · {a.entity_type}{a.entity_id ? ` #${a.entity_id}` : ''}</div></div>)}{!items.length && <Empty text="No audit events yet."/>}</div></Card></div>
    <div className="mt-6"><Card className="p-5"><div className="font-black">Order events</div><div className="mt-4 space-y-2">{orderEvents.map(e => <div key={e.id} className="border-b border-white/5 py-2 text-sm"><div className="flex items-center gap-3"><span className="text-xs text-white/40">{date(e.created_at)}</span><b>{e.actor_name || 'System'}</b></div><div>{e.event_type} · order{e.order_number ? ` ${e.order_number}` : ''}</div></div>)}{!orderEvents.length && <Empty text="No order events yet."/>}</div></Card></div>
  </div>;
}

function Table({ headers, rows }: { headers: ReactNode[]; rows: ReactNode[][] }) {
  return <Card className="overflow-x-auto"><table className="w-full min-w-[800px] text-sm"><thead><tr>{headers.map(h => <th key={String(h)} className="border-b border-white/10 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-white/40">{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i} className="border-b border-white/5 last:border-b-0 hover:bg-white/[.015]">{r.map((c, j) => <td key={j} className="px-4 py-3 align-top">{c}</td>)}</tr>)}{!rows.length && <tr><td colSpan={headers.length} className="px-4 py-12 text-center text-white/30">No rows.</td></tr>}</tbody></table></Card>;
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) { return <div><h1 className="text-2xl font-black tracking-[-.05em] md:text-4xl">{title}</h1><p className="mt-2 text-sm text-white/45">{subtitle}</p></div>; }
function Card({ children, className='' }: { children: ReactNode; className?: string }) { return <div className={`rounded-2xl border border-white/10 bg-white/[.025] ${className}`}>{children}</div>; }
function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) { return <Card className="p-5"><div className="text-[11px] font-bold uppercase tracking-[.13em] text-white/30">{label}</div><div className="mt-3 text-2xl font-black tracking-tight">{value}</div>{hint && <div className="mt-1 text-xs text-vura-300">{hint}</div>}</Card>; }
function Pill({ value }: { value: string }) { const good = ['paid','delivered','published','confirmed','available'].includes(value); const bad = ['rejected','cancelled','unavailable'].includes(value); return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${good ? 'bg-emerald-400/10 text-emerald-300' : bad ? 'bg-red-400/10 text-red-300' : 'bg-amber-300/10 text-amber-200'}`}>{pretty(value)}</span>; }
function Loading() { return <div className="grid min-h-[50vh] place-items-center text-white/40"><div className="flex items-center gap-2"><RefreshCw className="animate-spin" size={18}/> Loading Studio…</div></div>; }
function Empty({ text }: { text: string }) { return <div className="py-16 text-center text-sm text-white/30"><Package className="mx-auto mb-2" size={28}/>{text}</div>; }
function ClickMetric({ label, value, onClick }: { label: string; value: string; onClick: () => void }) { return <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[.02] p-3 text-left hover:bg-white/[.05]"><span className="flex-1 text-sm text-white/55">{label}</span><b>{value}</b><ChevronRight size={15} className="text-white/25"/></button>; }
