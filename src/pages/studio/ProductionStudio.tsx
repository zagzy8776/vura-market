import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity, AlertTriangle, Archive, Bell, Check, ChevronRight, CircleDollarSign,
  ClipboardList, CreditCard, FileText, LayoutDashboard, MapPin, Package, Plus,
  RefreshCw, Search, Settings, ShieldCheck, ShoppingBag, Store, Truck, UserRound, X,
} from 'lucide-react';

const money = (n: number | null | undefined) => `₦${(Number(n || 0) / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const date = (v?: string | null) => v ? new Date(v).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const pretty = (v: string) => v.replaceAll('_', ' ');

interface Order { id: string; order_number?: string; quantity: number; total_kobo: number; status: string; payment_status: string; transfer_reference?: string | null; payment_submitted_at?: string | null; sourcing_status?: string; delivery_name: string; delivery_phone: string; delivery_address: string; delivery_city: string; purchase_cost_kobo?: number | null; delivery_fee_kobo?: number; other_cost_kobo?: number; actual_profit_kobo?: number | null; created_at: string; product_name: string; brand: string; supplier_name?: string | null; buyer_email?: string; }
interface Product { id: string; name: string; brand: string; price_kobo: number; stock_status: string; is_active: boolean; source_price_kobo?: number | null; source_location?: string | null; supplier_name?: string | null; category?: string | null; images: string[]; }
interface Supplier { id: string; name: string; location?: string | null; phone?: string | null; notes?: string | null; reliability_score?: number; }
interface Customer { id: string; name: string; email: string; created_at: string; order_count: number; total_spend_kobo: number; }
interface Notification { id: string; user_email?: string; order_number?: string; title: string; body: string; created_at: string; }
interface Audit { id: string; action: string; entity_type: string; entity_id?: string; before_data?: unknown; after_data?: unknown; created_at: string; actor_name?: string; actor_email?: string; metadata?: unknown; }
interface Overview { liveProducts: number; monthlyOrders: number; monthlyRevenueKobo: number; monthlyProfitKobo: number; customers?: Customer[]; notifications?: Notification[]; audit?: Audit[]; orderEvents?: unknown[]; }

type Tab = 'overview' | 'orders' | 'payments' | 'products' | 'sourcing' | 'suppliers' | 'customers' | 'delivery' | 'notifications' | 'finance' | 'reports' | 'audit' | 'locations' | 'settings';

const nav: Array<{ id: Tab; label: string; icon: typeof LayoutDashboard; group?: string }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'orders', label: 'Orders', icon: ShoppingBag },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'sourcing', label: 'Sourcing', icon: Store },
  { id: 'suppliers', label: 'Suppliers', icon: Store },
  { id: 'customers', label: 'Customers', icon: UserRound },
  { id: 'delivery', label: 'Delivery', icon: Truck },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'finance', label: 'Finance', icon: CircleDollarSign },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'audit', label: 'Audit log', icon: Activity },
  { id: 'locations', label: 'Locations', icon: MapPin },
  { id: 'settings', label: 'Settings', icon: Settings },
];

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

export default function ProductionStudio() {
  const [tab, setTab] = useState<Tab>('overview');
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
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#6a4cff] shadow-lg shadow-[#6a4cff]/25"><span className="text-lg font-black">V</span></span>
          <div><div className="font-black tracking-tight">Vura Studio</div><div className="text-[11px] text-white/35">Commerce operating system</div></div>
        </div>
        <div className="mt-6 flex-1 space-y-1 overflow-y-auto">{nav.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${tab === item.id ? 'bg-[#6a4cff] text-white shadow-lg shadow-[#6a4cff]/20' : 'text-white/55 hover:bg-white/5 hover:text-white'}`}><Icon size={17}/>{item.label}</button>; })}</div>
        <div className="border-t border-white/10 pt-3 text-xs text-white/35"><div className="flex items-center gap-2"><ShieldCheck size={14}/> Server-authorized workspace</div></div>
      </aside>

      <section className="min-w-0 flex-1">
        <header className="sticky top-0 z-40 border-b border-white/10 bg-[#080a12]/90 backdrop-blur-xl">
          <div className="flex h-[72px] items-center gap-3 px-5 md:px-8">
            <div className="lg:hidden flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#6a4cff] font-black">V</span><b>Studio</b></div>
            <div className="relative max-w-2xl min-w-0 flex-1"><Search className="absolute left-3.5 top-3.5 text-white/30" size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search orders, products, customers, suppliers…" className="w-full rounded-xl border border-white/10 bg-white/[.035] py-3 pl-10 pr-4 text-sm outline-none focus:border-[#7f6aff]"/></div>
            <button onClick={() => void load()} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-white/55 hover:bg-white/5" aria-label="Refresh"><RefreshCw size={17} className={loading ? 'animate-spin' : ''}/></button>
            <div className="hidden md:flex items-center gap-3"><div className="text-right"><div className="text-sm font-bold">Vura Admin</div><div className="text-[11px] text-white/35">Owner workspace</div></div><span className="grid h-10 w-10 place-items-center rounded-full bg-[#6a4cff]/15 text-[#c8bfff]"><UserRound size={18}/></span></div>
          </div>
          <div className="flex gap-2 overflow-x-auto px-5 pb-3 lg:hidden">{nav.map(item => <button key={item.id} onClick={() => setTab(item.id)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold ${tab === item.id ? 'bg-[#6a4cff]' : 'bg-white/5 text-white/55'}`}>{item.label}</button>)}</div>
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
            {tab === 'delivery' && <DeliveryView orders={data.orders}/>} 
            {tab === 'notifications' && <NotificationsView items={data.notifications}/>} 
            {tab === 'finance' && <FinanceView orders={data.orders}/>} 
            {tab === 'reports' && <ReportsView orders={data.orders} products={data.products}/>} 
            {tab === 'audit' && <AuditView items={data.overview?.audit || []}/>} 
            {tab === 'locations' && <LocationsView/>} 
            {tab === 'settings' && <SettingsView/>}
          </>}
        </div>
      </section>
    </div>
  </main>;
}

function Header({ title, subtitle }: { title: string; subtitle: string }) { return <div className="mb-6"><div className="text-[11px] font-bold uppercase tracking-[.18em] text-white/30">Vura Studio</div><h1 className="mt-1 text-3xl font-black tracking-[-.05em] md:text-4xl">{title}</h1><p className="mt-2 text-sm text-white/45">{subtitle}</p></div>; }
function Card({ children, className='' }: { children: ReactNode; className?: string }) { return <div className={`rounded-2xl border border-white/10 bg-white/[.025] ${className}`}>{children}</div>; }
function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) { return <Card className="p-5"><div className="text-[11px] font-bold uppercase tracking-[.13em] text-white/30">{label}</div><div className="mt-3 text-2xl font-black tracking-tight">{value}</div>{hint && <div className="mt-1 text-xs text-[#aaa0ff]">{hint}</div>}</Card>; }
function Pill({ value }: { value: string }) { const good = ['paid','delivered','published','confirmed','available'].includes(value); const bad = ['rejected','cancelled','unavailable'].includes(value); return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${good ? 'bg-emerald-400/10 text-emerald-300' : bad ? 'bg-red-400/10 text-red-300' : 'bg-amber-300/10 text-amber-200'}`}>{pretty(value)}</span>; }
function Loading() { return <div className="grid min-h-[50vh] place-items-center text-white/40"><div className="flex items-center gap-2"><RefreshCw className="animate-spin" size={18}/> Loading Studio…</div></div>; }
function Empty({ text }: { text: string }) { return <div className="py-16 text-center text-sm text-white/30"><Package className="mx-auto mb-2" size={28}/>{text}</div>; }

function OverviewView({ data, onTab }: { data: { overview: Overview | null; orders: Order[]; products: Product[]; suppliers: Supplier[]; notifications: Notification[] }; onTab: (t: Tab) => void }) {
  const o = data.overview; const pending = data.orders.filter(x => x.payment_status === 'pending_verification'); const sourcing = data.orders.filter(x => ['awaiting_confirmation','confirmed','sourcing'].includes(x.sourcing_status || '')); const moving = data.orders.filter(x => x.status === 'out_for_delivery');
  return <div><Header title="Command centre" subtitle="The live operating picture of Vura — money, orders, sourcing and delivery in one place."/><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Revenue this month" value={money(o?.monthlyRevenueKobo)} hint="Verified payments"/><Stat label="Profit this month" value={money(o?.monthlyProfitKobo)} hint="Realized order profit"/><Stat label="Orders this month" value={String(o?.monthlyOrders ?? 0)} hint="All order states"/><Stat label="Live products" value={String(o?.liveProducts ?? 0)} hint="Published listings"/></div><div className="mt-6 grid gap-5 xl:grid-cols-[1.35fr_.65fr]"><Card className="p-6"><div className="flex items-center justify-between"><div><h2 className="font-black">Attention required</h2><p className="mt-1 text-sm text-white/40">Only real operational work appears here.</p></div><span className="rounded-full bg-[#6a4cff]/15 px-3 py-1 text-xs font-bold text-[#c7beff]">{pending.length + sourcing.length}</span></div><div className="mt-5 space-y-2">{pending.slice(0,4).map(x => <button key={x.id} onClick={() => onTab('payments')} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[.025] p-4 text-left hover:bg-white/[.05]"><CreditCard className="text-amber-300" size={18}/><span className="min-w-0 flex-1"><b className="block truncate">Payment verification · {x.order_number}</b><span className="text-xs text-white/40">{x.delivery_name} · {money(x.total_kobo)}</span></span><ChevronRight size={16} className="text-white/25"/></button>)}{sourcing.slice(0,4).map(x => <button key={x.id} onClick={() => onTab('sourcing')} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[.025] p-4 text-left hover:bg-white/[.05]"><Store className="text-[#bdb3ff]" size={18}/><span className="min-w-0 flex-1"><b className="block truncate">Sourcing · {x.product_name}</b><span className="text-xs text-white/40">{x.order_number} · {x.supplier_name || 'Supplier not assigned'}</span></span><ChevronRight size={16} className="text-white/25"/></button>)}{!pending.length && !sourcing.length && <Empty text="Nothing urgent right now."/>}</div></Card><div className="space-y-4"><Card className="p-5"><div className="font-black">Live operations</div><div className="mt-4 space-y-2"><ClickMetric label="Payment queue" value={String(pending.length)} onClick={() => onTab('payments')}/><ClickMetric label="Sourcing queue" value={String(sourcing.length)} onClick={() => onTab('sourcing')}/><ClickMetric label="Out for delivery" value={String(moving.length)} onClick={() => onTab('delivery')}/><ClickMetric label="Notifications" value={String(data.notifications.length)} onClick={() => onTab('notifications')}/></div></Card><Card className="p-5"><div className="flex items-center gap-2 text-xs text-white/45"><ShieldCheck size={15} className="text-emerald-300"/> Public pricing is separated from private supplier economics.</div></Card></div></div></div>;
}
function ClickMetric({ label, value, onClick }: { label: string; value: string; onClick: () => void }) { return <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[.02] p-3 text-left hover:bg-white/[.05]"><span className="flex-1 text-sm text-white/55">{label}</span><b>{value}</b><ChevronRight size={15} className="text-white/25"/></button>; }

function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) { return <Card><div className="overflow-auto"><table className="min-w-[980px] w-full text-sm"><thead><tr className="border-b border-white/10 bg-white/[.02] text-left text-[10px] font-bold uppercase tracking-[.14em] text-white/30">{headers.map(h => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody>{rows.map((r,i)=><tr key={i} className="border-b border-white/5 hover:bg-white/[.02]">{r.map((c,j)=><td key={j} className="px-4 py-4 align-top text-white/70">{c}</td>)}</tr>)}</tbody></table></div>{!rows.length && <Empty text="No records in this view."/>}</Card>; }

function OrdersView({ orders, onRefresh }: { orders: Order[]; onRefresh: () => void }) { return <div><div className="flex items-end justify-between gap-4"><Header title="Orders" subtitle="Every customer order, its payment state, sourcing state and fulfillment state."/><button onClick={onRefresh} className="mb-6 rounded-xl border border-white/10 p-3 text-white/50 hover:bg-white/5"><RefreshCw size={17}/></button></div><Table headers={['Order','Customer','Product','Amount','Payment','Sourcing','Status','Created']} rows={orders.map(o=>[<b>{o.order_number || o.id.slice(0,8)}</b>,<span>{o.delivery_name}<small className="block text-white/30">{o.buyer_email}</small></span>,<span>{o.product_name}<small className="block text-white/30">{o.brand}</small></span>,money(o.total_kobo),<Pill value={o.payment_status}/>,<Pill value={o.sourcing_status || 'unknown'}/>,<Pill value={o.status}/>,date(o.created_at)])}/></div>; }
function PaymentsView({ orders }: { orders: Order[] }) { const pending=orders.filter(o=>o.payment_status==='pending_verification'); const rejected=orders.filter(o=>o.payment_status==='rejected'); return <div><Header title="Payment verification" subtitle="Vura bank-transfer verification before sourcing begins."/><div className="grid gap-4 md:grid-cols-3"><Stat label="Pending" value={String(pending.length)}/><Stat label="Submitted value" value={money(pending.reduce((a,o)=>a+Number(o.total_kobo),0))}/><Stat label="Rejected" value={String(rejected.length)}/></div><div className="mt-6"><Table headers={['Order','Customer','Amount','Transfer reference','Submitted','State']} rows={pending.map(o=>[<b>{o.order_number}</b>,o.delivery_name,money(o.total_kobo),o.transfer_reference||'—',date(o.payment_submitted_at),<Pill value={o.payment_status}/>])}/></div></div>; }
function ProductsView({ products, onRefresh }: { products: Product[]; onRefresh: () => void }) { return <div><div className="flex items-end justify-between gap-4"><Header title="Products" subtitle="Public catalog records with private sourcing economics."/><button onClick={onRefresh} className="mb-6 rounded-xl bg-[#6a4cff] px-4 py-3 text-sm font-bold"><Plus className="mr-1 inline" size={16}/>Add product</button></div><Table headers={['Product','Category','Retail','Supplier cost','Supplier','Availability','Live']} rows={products.map(p=>[<span className="flex items-center gap-3"><Thumb src={p.images?.[0]}/><span><b>{p.name}</b><small className="block text-white/30">{p.brand}</small></span></span>,p.category||'—',money(p.price_kobo),p.source_price_kobo?money(p.source_price_kobo):'Private',p.supplier_name||'—',<Pill value={p.stock_status}/>,<Pill value={p.is_active?'published':'archived'}/>])}/></div>; }
function SourcingView({ orders }: { orders: Order[] }) { const rows=orders.filter(o=>['awaiting_confirmation','confirmed','sourcing','purchased'].includes(o.sourcing_status||'')); return <div><Header title="Sourcing" subtitle="The internal queue for physically finding and purchasing customer products."/><Table headers={['Order','Product','Supplier','Retail','Purchase','Status','Updated']} rows={rows.map(o=>[o.order_number||'—',<b>{o.product_name}</b>,o.supplier_name||<span className="text-amber-300">Unassigned</span>,money(o.total_kobo),o.purchase_cost_kobo?money(o.purchase_cost_kobo):'Not purchased',<Pill value={o.sourcing_status||'unknown'}/>,date(o.created_at)])}/></div>; }
function SuppliersView({ suppliers, onRefresh }: { suppliers: Supplier[]; onRefresh: () => void }) { return <div><div className="flex items-end justify-between gap-4"><Header title="Suppliers" subtitle="Private source network and supplier health."/><button onClick={onRefresh} className="mb-6 rounded-xl bg-[#6a4cff] px-4 py-3 text-sm font-bold"><Plus className="mr-1 inline" size={16}/>Add supplier</button></div><Table headers={['Supplier','Location','Phone','Reliability','Notes']} rows={suppliers.map(s=>[<b>{s.name}</b>,s.location||'—',s.phone||'—',String(s.reliability_score ?? 0),<span className="max-w-sm truncate text-white/40">{s.notes||'—'}</span>])}/></div>; }
function CustomersView({ customers }: { customers: Customer[] }) { return <div><Header title="Customers" subtitle="Customer accounts, order frequency and lifetime value."/><Table headers={['Customer','Email','Orders','Lifetime spend','Joined']} rows={customers.map(c=>[<b>{c.name}</b>,c.email,c.order_count,money(c.total_spend_kobo),date(c.created_at)])}/></div>; }
function DeliveryView({ orders }: { orders: Order[] }) { const moving=orders.filter(o=>['out_for_delivery','delivered'].includes(o.status)); return <div><Header title="Delivery" subtitle="Final-mile visibility. Rider assignment and delivery evidence are the next operational layer."/><Table headers={['Order','Customer','Address','City','Amount','State']} rows={moving.map(o=>[o.order_number,o.delivery_name,o.delivery_address,o.delivery_city,money(o.total_kobo),<Pill value={o.status}/>])}/></div>; }
function NotificationsView({ items }: { items: Notification[] }) { return <div><Header title="Notifications" subtitle="System-generated operational notifications tied to real customer activity."/><div className="space-y-2">{items.map(n=><Card key={n.id} className="p-4"><div className="flex items-start gap-3"><Bell size={17} className="mt-1 text-[#bdb3ff]"/><div className="min-w-0 flex-1"><b>{n.title}</b><p className="mt-1 text-sm text-white/50">{n.body}</p><p className="mt-2 text-[11px] text-white/25">{n.user_email||'user'} · {n.order_number||'system'} · {date(n.created_at)}</p></div></div></Card>)}{!items.length&&<Empty text="No notifications recorded."/>}</div></div>; }
function FinanceView({ orders }: { orders: Order[] }) { const paid=orders.filter(o=>o.payment_status==='paid'); const revenue=paid.reduce((a,o)=>a+Number(o.total_kobo),0); const supplier=paid.reduce((a,o)=>a+Number(o.purchase_cost_kobo||0),0); const delivery=paid.reduce((a,o)=>a+Number(o.delivery_fee_kobo||0),0); const other=paid.reduce((a,o)=>a+Number(o.other_cost_kobo||0),0); const profit=paid.reduce((a,o)=>a+Number(o.actual_profit_kobo||0),0); return <div><Header title="Finance" subtitle="Operational economics from paid orders. This is not yet a full accounting ledger."/><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Stat label="Revenue" value={money(revenue)}/><Stat label="Supplier cost" value={money(supplier)}/><Stat label="Delivery" value={money(delivery)}/><Stat label="Other costs" value={money(other)}/><Stat label="Actual profit" value={money(profit)}/></div><div className="mt-6"><Table headers={['Order','Revenue','Purchase','Delivery','Other','Profit']} rows={paid.map(o=>[<b>{o.order_number}</b>,money(o.total_kobo),money(o.purchase_cost_kobo),money(o.delivery_fee_kobo),money(o.other_cost_kobo),money(o.actual_profit_kobo)])}/></div></div>; }
function ReportsView({ orders, products }: { orders: Order[]; products: Product[] }) { const byProduct=new Map<string,{orders:number;revenue:number}>(); orders.forEach(o=>{const item=byProduct.get(o.product_name)||{orders:0,revenue:0};item.orders++;item.revenue+=Number(o.total_kobo);byProduct.set(o.product_name,item);}); return <div><Header title="Reports" subtitle="Live operational reports. Export and date-range reporting are still an explicit next layer."/><div className="grid gap-4 md:grid-cols-3"><Stat label="Catalog" value={String(products.length)}/><Stat label="Orders loaded" value={String(orders.length)}/><Stat label="Products with orders" value={String(byProduct.size)}/></div><Card className="mt-6 p-6"><h2 className="font-black">Top recorded products</h2><div className="mt-4 space-y-2">{Array.from(byProduct.entries()).sort((a,b)=>b[1].revenue-a[1].revenue).slice(0,10).map(([name,v])=><div key={name} className="flex items-center gap-4"><span className="flex-1 truncate text-sm font-semibold">{name}</span><span className="text-xs text-white/35">{v.orders} orders</span><b>{money(v.revenue)}</b></div>)}</div></Card></div>; }
function AuditView({ items }: { items: Audit[] }) { return <div><Header title="Audit log" subtitle="Administrative changes recorded with actor, entity and before/after state."/><Table headers={['Time','Actor','Action','Entity','Entity ID']} rows={items.map(a=>[date(a.created_at),<span>{a.actor_name||'System'}<small className="block text-white/30">{a.actor_email||''}</small></span>,a.action,a.entity_type,a.entity_id||'—'])}/></div>; }
function LocationsView() { return <div><Header title="Nigeria locations" subtitle="Location intelligence is a first-class production requirement: state → LGA → locality → street → address → delivery zone."/><Card className="p-7"><div className="flex items-start gap-4"><MapPin className="mt-1 text-[#bdb3ff]"/><div><h2 className="font-black">Location dataset integration</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/45">The database model for structured Nigerian addresses and delivery zones needs to be loaded before this screen can be considered production-ready. Do not use a hand-written browser list as the source of truth.</p><div className="mt-5 rounded-xl border border-amber-300/15 bg-amber-300/5 p-4 text-sm text-amber-100">Production gate: import and verify states, LGAs, localities, streets and postal/address references, then wire them into checkout and delivery zones.</div></div></div></Card></div>; }
function SettingsView() { return <div><Header title="Settings" subtitle="Vura operational configuration and production safety."/><div className="grid gap-5 lg:grid-cols-2"><Card className="p-6"><h2 className="font-black">Vura settlement account</h2><div className="mt-4 space-y-3"><KeyValue k="Account name" v="Vura Tech Hub"/><KeyValue k="Bank" v="VFD Microfinance Bank"/><KeyValue k="Account number" v="4600544947"/></div></Card><Card className="p-6"><h2 className="font-black">Production gates</h2><div className="mt-4 space-y-2 text-sm text-white/55"><CheckLine text="Private supplier economics separated from public catalog"/><CheckLine text="Server-side admin authorization"/><CheckLine text="Audit/event backend prepared"/><CheckLine text="Deployment must pass build + runtime verification"/><CheckLine text="Nigeria address/location dataset still required" ok={false}/><CheckLine text="Full payment ledger/reconciliation still required" ok={false}/><CheckLine text="Rider/delivery management still required" ok={false}/></div></Card></div></div>; }
function KeyValue({ k, v }: { k: string; v: string }) { return <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[.02] p-3"><span className="text-xs uppercase tracking-[.12em] text-white/30">{k}</span><b className="text-sm">{v}</b></div>; }
function CheckLine({ text, ok=true }: { text: string; ok?: boolean }) { return <div className="flex items-center gap-3"><span className={`grid h-6 w-6 place-items-center rounded-full ${ok?'bg-emerald-400/10 text-emerald-300':'bg-amber-300/10 text-amber-200'}`}>{ok?<Check size={14}/>:<AlertTriangle size={14}/>}</span><span>{text}</span></div>; }
function Thumb({ src }: { src?: string }) { return src ? <img src={src} alt="" className="h-10 w-10 rounded-lg object-cover"/> : <span className="grid h-10 w-10 place-items-center rounded-lg bg-white/5"><Package size={16}/></span>; }
