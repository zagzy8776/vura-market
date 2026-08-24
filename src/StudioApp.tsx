import { useEffect, useMemo, useState, useRef, type FormEvent, type ReactNode } from 'react';
import { uploadFilesToCloudinary } from '@/lib/cloudinary';
import {
  Bell, Check, ChevronRight, CircleDollarSign, Clock3, FileText, Filter, LayoutDashboard,
  Loader2, LogOut, Package, Plus, RefreshCw, Search, ShieldCheck, ShoppingBag, Store,
  Truck, UserRound, X, AlertTriangle, MoreHorizontal, Eye, Archive, CreditCard,
} from 'lucide-react';

type Order = {
  id: string; order_number?: string; quantity: number; total_kobo: number; status: string;
  payment_status: string; transfer_reference?: string | null; payment_submitted_at?: string | null;
  payment_verified_at?: string | null; sourcing_status?: string; delivery_name: string; delivery_phone: string;
  delivery_address: string; delivery_city: string; purchase_cost_kobo?: number | null;
  delivery_fee_kobo?: number; other_cost_kobo?: number; actual_profit_kobo?: number | null;
  created_at: string; product_name: string; brand: string; supplier_name?: string | null; buyer_email?: string;
};
type Product = {
  id: string; name: string; brand: string; price_kobo: number; condition_label: string; storage?: string | null;
  color?: string | null; stock_status: string; is_active: boolean; source_price_kobo?: number | null;
  source_location?: string | null; expected_cost_kobo?: number | null; verified_at?: string | null;
  supplier_name?: string | null; category?: string | null; images: string[];
};
type Supplier = { id: string; name: string; location?: string | null; phone?: string | null; notes?: string | null; reliability_score?: number };
type Customer = { id: string; name: string; email: string; role: string; created_at: string; order_count: number; total_spend_kobo: number };
type Notification = { id: string; user_id: string; order_id?: string | null; type: string; title: string; body: string; created_at: string; user_email?: string; order_number?: string };
type Overview = { liveProducts: number; monthlyOrders: number; monthlyRevenueKobo: number; monthlyProfitKobo: number };

type Tab = 'overview' | 'orders' | 'payments' | 'products' | 'sourcing' | 'suppliers' | 'customers' | 'delivery' | 'notifications' | 'finance' | 'reports';
const tabs: Array<{ key: Tab; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'orders', label: 'Orders', icon: ShoppingBag },
  { key: 'payments', label: 'Payments', icon: CreditCard },
  { key: 'products', label: 'Products', icon: Package },
  { key: 'sourcing', label: 'Sourcing', icon: Store },
  { key: 'suppliers', label: 'Suppliers', icon: Store },
  { key: 'customers', label: 'Customers', icon: UserRound },
  { key: 'delivery', label: 'Delivery', icon: Truck },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'finance', label: 'Finance', icon: CircleDollarSign },
  { key: 'reports', label: 'Reports', icon: FileText },
];
const money = (n: number | null | undefined) => `₦${(Number(n || 0) / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
const fmtDate = (value?: string | null) => value ? new Date(value).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const statuses = ['awaiting_payment','payment_verification','confirmed','sourcing','purchased','out_for_delivery','delivered','cancelled'];
const sourcingStatuses = ['awaiting_confirmation','confirmed','sourcing','purchased','out_for_delivery','delivered','cancelled'];
const paymentStatuses = ['unpaid','pending_verification','paid','rejected'];

export default function StudioApp() {
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [productModal, setProductModal] = useState(false);
  const [supplierModal, setSupplierModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  async function loadAll() {
    setBusy(true); setError('');
    try {
      const [o, ord, prod, sup, cus, note] = await Promise.all([
        fetch('/api/admin/overview', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/admin/orders', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/admin/products', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/admin/suppliers', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/admin/customers', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/admin/notifications', { credentials: 'include' }).then(r => r.json()),
      ]);
      if (o?.error) throw new Error(o.error);
      if (ord?.error) throw new Error(ord.error);
      setOverview(o); setOrders(ord.orders || []); setProducts(prod.products || []); setSuppliers(sup.suppliers || []); setCustomers(cus.customers || []); setNotifications(note.notifications || []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load Studio data.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void loadAll(); }, []);

  const filteredOrders = useMemo(() => orders.filter(o => `${o.order_number || ''} ${o.delivery_name} ${o.delivery_phone} ${o.buyer_email || ''} ${o.product_name}`.toLowerCase().includes(search.toLowerCase())), [orders, search]);
  const filteredProducts = useMemo(() => products.filter(p => `${p.name} ${p.brand} ${p.category || ''} ${p.supplier_name || ''}`.toLowerCase().includes(search.toLowerCase())), [products, search]);
  const filteredCustomers = useMemo(() => customers.filter(c => `${c.name} ${c.email}`.toLowerCase().includes(search.toLowerCase())), [customers, search]);
  const filteredSuppliers = useMemo(() => suppliers.filter(s => `${s.name} ${s.location || ''} ${s.phone || ''}`.toLowerCase().includes(search.toLowerCase())), [suppliers, search]);

  async function updateOrder(body: Record<string, unknown>) {
    if (!selectedOrder) return;
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/admin/orders', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: selectedOrder.id, ...body }) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Update failed.');
      setSelectedOrder(null); await loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : 'Update failed.'); setBusy(false); }
  }

  async function updateProduct(productId: string, body: Record<string, unknown>) {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/admin/products', { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId, ...body }) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Product update failed.');
      setSelectedProduct(null); await loadAll();
    } catch (e) { setError(e instanceof Error ? e.message : 'Product update failed.'); setBusy(false); }
  }

  return <main className="min-h-screen bg-[#0b0d17] text-white">
    <div className="mx-auto flex max-w-[1680px]">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-white/10 bg-[#0c0e18] p-4 lg:flex">
        <div className="flex items-center gap-3 px-2 py-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#5b35f5] shadow-lg shadow-[#5b35f5]/20"><span className="text-lg font-black">V</span></span><div><p className="font-black tracking-tight">Vura Studio</p><p className="text-[11px] text-white/40">Operations OS</p></div></div>
        <div className="mt-6 flex-1 space-y-1 overflow-auto">{tabs.map(t => { const Icon = t.icon; return <button key={t.key} onClick={() => setTab(t.key)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${tab === t.key ? 'bg-[#5b35f5] text-white shadow-lg shadow-[#5b35f5]/20' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}><Icon size={17}/>{t.label}</button>; })}</div>
        <div className="border-t border-white/10 pt-3 text-xs text-white/40"><p>Protected admin workspace</p><p className="mt-1 flex items-center gap-1.5"><ShieldCheck size={13}/> Server-authorized actions</p></div>
      </aside>

      <section className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0b0d17]/95 backdrop-blur-xl">
          <div className="flex h-[72px] items-center gap-3 px-5 md:px-8"><div className="lg:hidden flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#5b35f5] font-black">V</span><b>Studio</b></div><div className="relative min-w-0 flex-1 max-w-2xl"><Search className="absolute left-3.5 top-3.5 text-white/35" size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders, products, customers, suppliers..." className="w-full rounded-xl border border-white/10 bg-white/[.04] py-3 pl-10 pr-4 text-sm text-white outline-none focus:border-[#7a64ff]"/></div><button onClick={() => void loadAll()} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-white/55 hover:bg-white/5" aria-label="Refresh"><RefreshCw size={17} className={busy ? 'animate-spin' : ''}/></button><div className="hidden items-center gap-3 md:flex"><div className="text-right"><p className="text-sm font-bold">Vura Admin</p><p className="text-[11px] text-white/40">Owner workspace</p></div><span className="grid h-10 w-10 place-items-center rounded-full bg-[#5b35f5]/20 text-[#c8c0ff]"><UserRound size={18}/></span></div></div>
          <div className="flex gap-2 overflow-x-auto px-5 pb-3 lg:hidden">{tabs.map(t => <button key={t.key} onClick={() => setTab(t.key)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold ${tab === t.key ? 'bg-[#5b35f5]' : 'bg-white/5 text-white/60'}`}>{t.label}</button>)}</div>
        </header>

        <div className="p-5 md:p-8">
          {error && <div className="mb-5 flex items-center gap-3 border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200"><AlertTriangle size={17}/><span className="flex-1">{error}</span><button onClick={() => setError('')}><X size={16}/></button></div>}
          {tab === 'overview' && <Overview overview={overview} orders={orders} onOrder={setSelectedOrder} onRefresh={() => void loadAll()} />}
          {tab === 'orders' && <OrdersView orders={filteredOrders} onOrder={setSelectedOrder} />}
          {tab === 'payments' && <PaymentsView orders={orders.filter(o => o.payment_status !== 'paid')} onOrder={setSelectedOrder} />}
          {tab === 'products' && <ProductsView products={filteredProducts} onAdd={() => setProductModal(true)} onEdit={setSelectedProduct} onUpdate={updateProduct} />}
          {tab === 'sourcing' && <SourcingView orders={orders.filter(o => ['awaiting_confirmation','confirmed','sourcing','purchased'].includes(o.sourcing_status || ''))} onOrder={setSelectedOrder} />}
          {tab === 'suppliers' && <SuppliersView suppliers={filteredSuppliers} onAdd={() => setSupplierModal(true)} />}
          {tab === 'customers' && <CustomersView customers={filteredCustomers} />}
          {tab === 'delivery' && <DeliveryView orders={orders.filter(o => ['out_for_delivery','delivered'].includes(o.status))} onOrder={setSelectedOrder} />}
          {tab === 'notifications' && <NotificationsView notifications={notifications} />}
          {tab === 'finance' && <FinanceView orders={orders} />}
          {tab === 'reports' && <ReportsView orders={orders} products={products} />}
        </div>
      </section>
    </div>

    {selectedOrder && <OrderDrawer order={selectedOrder} suppliers={suppliers} onClose={() => setSelectedOrder(null)} onUpdate={updateOrder} busy={busy} />}
    {selectedProduct && <ProductDrawer product={selectedProduct} onClose={() => setSelectedProduct(null)} onSave={updateProduct} busy={busy} />}
    {productModal && <ProductCreateModal suppliers={suppliers} onClose={() => setProductModal(false)} onCreated={() => { setProductModal(false); void loadAll(); }} onError={setError} />}
    {supplierModal && <SupplierCreateModal onClose={() => setSupplierModal(false)} onCreated={() => { setSupplierModal(false); void loadAll(); }} onError={setError} />}
  </main>;
}

function PageHeader({ title, subtitle, action, onAction }: { title: string; subtitle: string; action?: string; onAction?: () => void }) { return <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-white/35">Vura Studio</p><h1 className="mt-1 text-3xl font-black tracking-[-.05em] md:text-4xl">{title}</h1><p className="mt-2 max-w-2xl text-sm text-white/45">{subtitle}</p></div>{action && <button onClick={onAction} className="rounded-xl bg-[#5b35f5] px-4 py-3 text-sm font-bold shadow-lg shadow-[#5b35f5]/20"><Plus className="mr-1.5 inline" size={16}/>{action}</button>}</div>; }
function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) { return <div className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><p className="text-xs font-bold uppercase tracking-[.12em] text-white/35">{label}</p><p className="mt-3 text-2xl font-black tracking-tight">{value}</p>{hint && <p className="mt-1 text-xs font-semibold text-[#aaa2ff]">{hint}</p>}</div>; }
function Overview({ overview, orders, onOrder, onRefresh }: { overview: Overview | null; orders: Order[]; onOrder: (o: Order) => void; onRefresh: () => void }) { const pending = orders.filter(o => o.payment_status === 'pending_verification'); const sourcing = orders.filter(o => ['awaiting_confirmation','confirmed','sourcing'].includes(o.sourcing_status || '')); const delayed = orders.filter(o => o.status === 'out_for_delivery'); return <div><PageHeader title="Command centre" subtitle="Live operational picture of Vura's commerce business." action="Refresh data" onAction={onRefresh}/><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Stat label="Live products" value={String(overview?.liveProducts ?? 0)} hint="Published listings"/><Stat label="Orders this month" value={String(overview?.monthlyOrders ?? 0)} hint="All statuses"/><Stat label="Revenue this month" value={money(overview?.monthlyRevenueKobo)} hint="Verified payments"/><Stat label="Profit this month" value={money(overview?.monthlyProfitKobo)} hint="Realized orders"/></div><div className="mt-6 grid gap-5 xl:grid-cols-[1.3fr_.7fr]"><div className="rounded-2xl border border-white/10 bg-white/[.025] p-6"><div className="flex items-center justify-between"><div><h2 className="font-black">Needs attention</h2><p className="mt-1 text-sm text-white/40">Click a row to handle it.</p></div><span className="rounded-full bg-[#5b35f5]/15 px-3 py-1 text-xs font-bold text-[#c5bfff]">{pending.length + sourcing.length}</span></div><div className="mt-5 space-y-2">{pending.slice(0,4).map(o => <button key={o.id} onClick={() => onOrder(o)} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[.03] p-4 text-left hover:bg-white/[.06]"><CreditCard size={18} className="text-amber-300"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">Payment verification · {o.order_number}</p><p className="text-xs text-white/40">{o.delivery_name} · {money(o.total_kobo)}</p></div><ChevronRight size={16} className="text-white/30"/></button>)}{sourcing.slice(0,4).map(o => <button key={o.id} onClick={() => onOrder(o)} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[.03] p-4 text-left hover:bg-white/[.06]"><Store size={18} className="text-[#b9b1ff]"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">Sourcing · {o.product_name}</p><p className="text-xs text-white/40">{o.order_number} · {o.supplier_name || 'No supplier assigned'}</p></div><ChevronRight size={16} className="text-white/30"/></button>)}{!pending.length && !sourcing.length && <div className="rounded-xl border border-dashed border-white/10 py-14 text-center text-sm text-white/35"><Check className="mx-auto mb-2 text-emerald-300"/>Nothing urgent right now.</div>}</div></div><div className="rounded-2xl border border-white/10 bg-white/[.025] p-6"><h2 className="font-black">Live delivery</h2><p className="mt-1 text-sm text-white/40">Orders currently moving.</p><div className="mt-5 space-y-4"><MiniMetric icon={<Truck size={17}/>} label="Out for delivery" value={String(delayed.length)}/><MiniMetric icon={<Clock3 size={17}/>} label="Awaiting sourcing" value={String(sourcing.length)}/><MiniMetric icon={<Bell size={17}/>} label="Unread-style alerts" value={String(Math.min(orders.length, 12))}/></div></div></div></div>; }
function MiniMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.03] p-4"><span className="text-[#b7aeff]">{icon}</span><span className="flex-1 text-sm text-white/55">{label}</span><b>{value}</b></div>; }
function OrdersView({ orders, onOrder }: { orders: Order[]; onOrder: (o: Order) => void }) { return <div><PageHeader title="Orders" subtitle="Every customer order and its operational state."/><DataTable headers={['Order','Customer','Product','Amount','Payment','Sourcing','Status','Created']} rows={orders.map(o => [<button onClick={() => onOrder(o)} className="font-bold text-[#c9c2ff] hover:underline">{o.order_number || o.id.slice(0,8)}</button>, <span>{o.delivery_name}<small className="block text-white/35">{o.buyer_email}</small></span>, <span>{o.product_name}<small className="block text-white/35">{o.brand}</small></span>, money(o.total_kobo), <StatusChip text={o.payment_status}/>, <StatusChip text={o.sourcing_status || '—'}/>, <StatusChip text={o.status}/>, fmtDate(o.created_at)])}/></div>; }
function PaymentsView({ orders, onOrder }: { orders: Order[]; onOrder: (o: Order) => void }) { const pending = orders.filter(o => o.payment_status === 'pending_verification'); return <div><PageHeader title="Payment verification" subtitle="Verify Vura bank transfers before sourcing begins."/><div className="mb-5 grid gap-4 md:grid-cols-3"><Stat label="Pending verification" value={String(pending.length)}/><Stat label="Submitted value" value={money(pending.reduce((a,o)=>a+Number(o.total_kobo),0))}/><Stat label="Rejected" value={String(orders.filter(o=>o.payment_status==='rejected').length)}/></div><DataTable headers={['Order','Customer','Amount','Transfer reference','Submitted','Action']} rows={pending.map(o => [<b>{o.order_number}</b>, <span>{o.delivery_name}<small className="block text-white/35">{o.buyer_email}</small></span>, money(o.total_kobo), o.transfer_reference || '—', fmtDate(o.payment_submitted_at), <button onClick={() => onOrder(o)} className="rounded-lg bg-[#5b35f5] px-3 py-2 text-xs font-bold">Review</button>])}/></div>; }
function ProductsView({ products, onAdd, onEdit, onUpdate }: { products: Product[]; onAdd: () => void; onEdit: (p: Product) => void; onUpdate: (id: string, body: Record<string, unknown>) => void }) { return <div><PageHeader title="Products" subtitle="Publish, price, verify, archive and maintain the public catalog." action="Add product" onAction={onAdd}/><DataTable headers={['Product','Category','Retail','Source cost','Supplier','Availability','Live','Actions']} rows={products.map(p => [<span className="flex items-center gap-3"><Thumb src={p.images?.[0]}/><span><b>{p.name}</b><small className="block text-white/35">{p.brand}</small></span></span>, p.category || '—', money(p.price_kobo), p.source_price_kobo ? money(p.source_price_kobo) : 'Private', p.supplier_name || '—', <StatusChip text={p.stock_status}/>, p.is_active ? <StatusChip text="published"/> : <StatusChip text="archived"/>, <div className="flex gap-1"><button onClick={() => onEdit(p)} className="grid h-8 w-8 place-items-center rounded-lg bg-white/5" title="Edit"><Eye size={15}/></button>{p.is_active && <button onClick={() => onUpdate(p.id,{ isActive:false })} className="grid h-8 w-8 place-items-center rounded-lg bg-white/5" title="Archive"><Archive size={15}/></button>}{!p.is_active && <button onClick={() => onUpdate(p.id,{ isActive:true })} className="grid h-8 w-8 place-items-center rounded-lg bg-white/5" title="Publish"><Check size={15}/></button>}</div>])}/></div>; }
function SourcingView({ orders, onOrder }: { orders: Order[]; onOrder: (o: Order) => void }) { return <div><PageHeader title="Sourcing" subtitle="Turn a verified order into a real purchase from a real local source."/><DataTable headers={['Order','Product','Supplier','Retail','Purchase cost','Sourcing status','Action']} rows={orders.map(o => [o.order_number || '—', <b>{o.product_name}</b>, o.supplier_name || <span className="text-amber-300">Unassigned</span>, money(o.total_kobo), o.purchase_cost_kobo ? money(o.purchase_cost_kobo) : 'Not purchased', <StatusChip text={o.sourcing_status || '—'}/>, <button onClick={() => onOrder(o)} className="rounded-lg bg-[#5b35f5] px-3 py-2 text-xs font-bold">Open sourcing</button>])}/></div>; }
function SuppliersView({ suppliers, onAdd }: { suppliers: Supplier[]; onAdd: () => void }) { return <div><PageHeader title="Suppliers" subtitle="Your private source network and relationship history." action="Add supplier" onAction={onAdd}/><DataTable headers={['Supplier','Location','Phone','Reliability','Notes']} rows={suppliers.map(s => [<b>{s.name}</b>, s.location || '—', s.phone || '—', <span>{'★'.repeat(Math.max(0,Math.min(5,Number(s.reliability_score || 0))))}</span>, <span className="max-w-xs truncate text-white/45">{s.notes || '—'}</span>])}/></div>; }
function CustomersView({ customers }: { customers: Customer[] }) { return <div><PageHeader title="Customers" subtitle="Customer accounts, lifetime value and order history."/><DataTable headers={['Customer','Email','Orders','Total spend','Joined']} rows={customers.map(c => [<b>{c.name}</b>, c.email, c.order_count, money(c.total_spend_kobo), fmtDate(c.created_at)])}/></div>; }
function DeliveryView({ orders, onOrder }: { orders: Order[]; onOrder: (o: Order) => void }) { return <div><PageHeader title="Delivery" subtitle="Monitor the final mile from pickup to customer."/><DataTable headers={['Order','Customer','Address','Amount','State','Action']} rows={orders.map(o => [o.order_number, o.delivery_name, <span>{o.delivery_address}<small className="block text-white/35">{o.delivery_city}</small></span>, money(o.total_kobo), <StatusChip text={o.status}/>, <button onClick={() => onOrder(o)} className="rounded-lg bg-white/5 px-3 py-2 text-xs font-bold">Track</button>])}/></div>; }
function NotificationsView({ notifications }: { notifications: Notification[] }) { return <div><PageHeader title="Notifications" subtitle="Operational notifications emitted by the system."/><div className="space-y-2">{notifications.map(n => <div key={n.id} className="rounded-xl border border-white/10 bg-white/[.03] p-4"><div className="flex items-start gap-3"><Bell size={17} className="mt-1 text-[#b8b0ff]"/><div className="flex-1"><p className="font-bold">{n.title}</p><p className="mt-1 text-sm text-white/50">{n.body}</p><p className="mt-2 text-[11px] text-white/25">{n.user_email || 'user'} · {fmtDate(n.created_at)}</p></div></div></div>)}{!notifications.length && <Empty message="No notifications have been recorded yet."/>}</div></div>; }
function FinanceView({ orders }: { orders: Order[] }) { const paid = orders.filter(o => o.payment_status === 'paid'); const revenue = paid.reduce((a,o)=>a+Number(o.total_kobo),0); const supplier = paid.reduce((a,o)=>a+Number(o.purchase_cost_kobo || 0),0); const delivery = paid.reduce((a,o)=>a+Number(o.delivery_fee_kobo || 0),0); const other = paid.reduce((a,o)=>a+Number(o.other_cost_kobo || 0),0); const profit = paid.reduce((a,o)=>a+Number(o.actual_profit_kobo || 0),0); return <div><PageHeader title="Finance" subtitle="Operational economics from real paid orders."/><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Stat label="Revenue" value={money(revenue)}/><Stat label="Supplier cost" value={money(supplier)}/><Stat label="Delivery" value={money(delivery)}/><Stat label="Other costs" value={money(other)}/><Stat label="Actual profit" value={money(profit)}/></div><div className="mt-6 rounded-2xl border border-white/10 bg-white/[.03] p-6"><h2 className="font-black">Paid order economics</h2><div className="mt-5 overflow-auto"><table className="min-w-full text-sm"><thead><tr className="border-b border-white/10 text-left text-xs uppercase tracking-wider text-white/35"><th className="pb-3">Order</th><th className="pb-3">Revenue</th><th className="pb-3">Purchase</th><th className="pb-3">Delivery</th><th className="pb-3">Other</th><th className="pb-3">Profit</th></tr></thead><tbody>{paid.map(o => <tr key={o.id} className="border-b border-white/5"><td className="py-4 font-bold">{o.order_number}</td><td>{money(o.total_kobo)}</td><td>{money(o.purchase_cost_kobo)}</td><td>{money(o.delivery_fee_kobo)}</td><td>{money(o.other_cost_kobo)}</td><td className={Number(o.actual_profit_kobo || 0) >= 0 ? 'text-emerald-300 font-bold' : 'text-red-300 font-bold'}>{money(o.actual_profit_kobo)}</td></tr>)}</tbody></table></div></div></div>; }
function ReportsView({ orders, products }: { orders: Order[]; products: Product[] }) { const categories = new Map<string,{orders:number;revenue:number}>(); orders.forEach(o => { const key = o.product_name; const item = categories.get(key) || {orders:0,revenue:0}; item.orders += 1; item.revenue += Number(o.total_kobo); categories.set(key,item); }); return <div><PageHeader title="Reports" subtitle="Export-ready operational views built from live data."/><div className="grid gap-4 md:grid-cols-3"><Stat label="Catalog size" value={String(products.length)}/><Stat label="Order records" value={String(orders.length)}/><Stat label="Tracked products" value={String(categories.size)}/></div><div className="mt-6 rounded-2xl border border-white/10 bg-white/[.03] p-6"><h2 className="font-black">Top products by recorded revenue</h2><div className="mt-5 space-y-3">{Array.from(categories.entries()).sort((a,b)=>b[1].revenue-a[1].revenue).slice(0,10).map(([name,item]) => <div key={name} className="flex items-center gap-4"><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{name}</p><p className="text-xs text-white/35">{item.orders} orders</p></div><b>{money(item.revenue)}</b></div>)}</div></div></div>; }
function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) { return <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[.025]"><div className="overflow-auto"><table className="min-w-[960px] w-full text-sm"><thead><tr className="border-b border-white/10 bg-white/[.025] text-left text-[11px] uppercase tracking-[.14em] text-white/30">{headers.map(h => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i} className="border-b border-white/5 hover:bg-white/[.02]">{row.map((cell,j)=><td key={j} className="px-4 py-4 align-top text-white/70">{cell}</td>)}</tr>)}</tbody></table></div>{!rows.length && <Empty message="No records match this view."/>}</div>; }
function StatusChip({ text }: { text: string }) { const good = ['paid','delivered','published','confirmed'].includes(text); const warn = ['pending_verification','sourcing','out_for_delivery','payment_verification','awaiting_confirmation'].includes(text); return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${good ? 'bg-emerald-400/10 text-emerald-300' : warn ? 'bg-amber-300/10 text-amber-200' : 'bg-white/5 text-white/45'}`}>{text.replaceAll('_',' ')}</span>; }
function Empty({ message }: { message: string }) { return <div className="py-14 text-center text-sm text-white/35"><Package className="mx-auto mb-2" size={28}/>{message}</div>; }
function Thumb({ src }: { src?: string }) { return src ? <img src={src} alt="" className="h-10 w-10 rounded-lg object-cover bg-white/5"/> : <span className="grid h-10 w-10 place-items-center rounded-lg bg-white/5"><Package size={16}/></span>; }

function OrderDrawer({ order, suppliers, onClose, onUpdate, busy }: { order: Order; suppliers: Supplier[]; onClose: () => void; onUpdate: (body: Record<string, unknown>) => void; busy: boolean }) {
  const [status, setStatus] = useState(order.status); const [payment, setPayment] = useState(order.payment_status); const [sourcing, setSourcing] = useState(order.sourcing_status || 'awaiting_confirmation'); const [supplierId, setSupplierId] = useState(''); const [purchase, setPurchase] = useState(order.purchase_cost_kobo ? String(order.purchase_cost_kobo / 100) : ''); const [delivery, setDelivery] = useState(String((order.delivery_fee_kobo || 0) / 100)); const [other, setOther] = useState(String((order.other_cost_kobo || 0) / 100));
  return <Drawer title={order.order_number || 'Order'} onClose={onClose}><div className="space-y-6"><section><p className="text-xs font-bold uppercase tracking-[.13em] text-white/35">Customer</p><p className="mt-2 font-bold">{order.delivery_name}</p><p className="text-sm text-white/45">{order.buyer_email}</p><p className="mt-2 text-sm text-white/60">{order.delivery_phone}</p><p className="mt-1 text-sm text-white/60">{order.delivery_address}, {order.delivery_city}</p></section><section><p className="text-xs font-bold uppercase tracking-[.13em] text-white/35">Order economics</p><div className="mt-3 grid grid-cols-2 gap-2"><DarkKV k="Retail" v={money(order.total_kobo)}/><DarkKV k="Purchase" v={money(order.purchase_cost_kobo)}/><DarkKV k="Delivery" v={money(order.delivery_fee_kobo)}/><DarkKV k="Profit" v={money(order.actual_profit_kobo)}/></div></section><section><p className="text-xs font-bold uppercase tracking-[.13em] text-white/35">Payment</p><div className="mt-3 rounded-xl border border-white/10 bg-white/[.03] p-4"><div className="flex items-center gap-3"><CreditCard size={18} className="text-[#b9b0ff]"/><div><p className="font-bold">{payment}</p><p className="text-xs text-white/35">{order.transfer_reference || 'No transfer reference'}</p></div></div>{order.payment_submitted_at && <p className="mt-3 text-xs text-white/35">Submitted {fmtDate(order.payment_submitted_at)}</p>}</div></section><section className="space-y-4"><Select label="Order status" value={status} onChange={setStatus} options={statuses}/><Select label="Payment status" value={payment} onChange={setPayment} options={paymentStatuses}/><Select label="Sourcing status" value={sourcing} onChange={setSourcing} options={sourcingStatuses}/><Select label="Supplier" value={supplierId} onChange={setSupplierId} options={['', ...suppliers.map(s=>s.id)]} labels={['No change', ...suppliers.map(s=>s.name)]}/><MoneyField label="Purchase cost" value={purchase} onChange={setPurchase}/><MoneyField label="Delivery cost" value={delivery} onChange={setDelivery}/><MoneyField label="Other cost" value={other} onChange={setOther}/></section><button onClick={() => onUpdate({ status, paymentStatus: payment, sourcingStatus: sourcing, supplierId: supplierId || undefined, purchaseCostKobo: purchase ? Math.round(Number(purchase)*100) : undefined, deliveryFeeKobo: Math.round(Number(delivery || 0)*100), otherCostKobo: Math.round(Number(other || 0)*100) })} disabled={busy} className="w-full rounded-xl bg-[#5b35f5] px-4 py-3.5 font-bold disabled:opacity-60">{busy ? 'Saving…' : 'Save operational changes'}</button></div></Drawer>;
}
function ProductDrawer({ product, onClose, onSave, busy }: { product: Product; onClose: () => void; onSave: (id:string, body:Record<string,unknown>)=>void; busy:boolean }) { const [price,setPrice]=useState(String(product.price_kobo/100)); const [source,setSource]=useState(product.source_price_kobo ? String(product.source_price_kobo/100) : ''); const [stock,setStock]=useState(product.stock_status); const [active,setActive]=useState(product.is_active); return <Drawer title={product.name} onClose={onClose}><div className="space-y-5"><Thumb src={product.images?.[0]}/><DarkKV k="Supplier" v={product.supplier_name || 'Unassigned'}/><DarkKV k="Source location" v={product.source_location || '—'}/><MoneyField label="Retail price" value={price} onChange={setPrice}/><MoneyField label="Supplier price" value={source} onChange={setSource}/><Select label="Availability" value={stock} onChange={setStock} options={['available','limited','unavailable']}/><label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)} /> Published on storefront</label><button onClick={()=>onSave(product.id,{priceKobo:Math.round(Number(price)*100),sourcePriceKobo:source?Math.round(Number(source)*100):undefined,stockStatus:stock,isActive:active})} disabled={busy} className="w-full rounded-xl bg-[#5b35f5] px-4 py-3 font-bold">{busy?'Saving…':'Save product'}</button></div></Drawer>; }
function Drawer({ title, onClose, children }: { title:string; onClose:()=>void; children:ReactNode }) { return <div className="fixed inset-0 z-[100] flex justify-end bg-black/60"><div className="h-full w-full max-w-xl overflow-auto border-l border-white/10 bg-[#0d0f1a] p-6 shadow-2xl"><div className="mb-6 flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-white/35">Vura Studio</p><h2 className="mt-1 text-2xl font-black">{title}</h2></div><button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10"><X size={18}/></button></div>{children}</div></div>; }
function DarkKV({k,v}:{k:string;v:string}){return <div className="rounded-xl border border-white/10 bg-white/[.03] p-3"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-white/30">{k}</p><p className="mt-1 text-sm font-bold text-white/80">{v}</p></div>}
function Select({label,value,onChange,options,labels}:{label:string;value:string;onChange:(v:string)=>void;options:string[];labels?:string[]}){return <label className="block"><span className="text-xs font-bold text-white/45">{label}</span><select value={value} onChange={e=>onChange(e.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#121522] px-3 py-3 text-sm text-white outline-none focus:border-[#7d69ff]">{options.map((o,i)=><option key={o} value={o}>{labels?.[i] || o.replaceAll('_',' ')}</option>)}</select></label>}
function MoneyField({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){return <label className="block"><span className="text-xs font-bold text-white/45">{label}</span><div className="mt-1.5 flex items-center rounded-xl border border-white/10 bg-[#121522]"><span className="pl-3 text-white/35">₦</span><input value={value} onChange={e=>onChange(e.target.value)} inputMode="decimal" className="w-full bg-transparent px-2 py-3 text-sm text-white outline-none"/></div></label>}

function ProductCreateModal({ suppliers, onClose, onCreated, onError }: { suppliers: Supplier[]; onClose: () => void; onCreated: () => void; onError: (s: string) => void }) {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [price, setPrice] = useState('');
  const [source, setSource] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [sourceLocation, setSourceLocation] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/categories').then(r => r.ok ? r.json() : null).then(d => {
      if (d?.categories) setCategories(d.categories);
    }).catch(() => undefined);
  }, []);

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const selected = Array.from(files).slice(0, 6 - imageFiles.length);
    setImageFiles(prev => [...prev, ...selected]);
    selected.forEach(f => {
      const reader = new FileReader();
      reader.onload = e => setImagePreviews(prev => [...prev, e.target?.result as string]);
      reader.readAsDataURL(f);
    });
  }

  function removeImage(idx: number) {
    setImageFiles(prev => prev.filter((_, i) => i !== idx));
    setImagePreviews(prev => prev.filter((_, i) => i !== idx));
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (imageFiles.length < 1) { onError('Please upload at least one product image.'); return; }
    setBusy(true);
    try {
      setUploading(true);
      let imageUrls: string[];
      try {
        imageUrls = await uploadFilesToCloudinary(imageFiles);
      } catch (err) {
        throw new Error(err instanceof Error ? `Image upload failed: ${err.message}` : 'Image upload failed');
      } finally {
        setUploading(false);
      }
      const r = await fetch('/api/products', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, brand,
          categoryId: categoryId || null,
          description,
          priceKobo: Math.round(Number(price) * 100),
          conditionLabel: 'New',
          supplierId: supplierId || null,
          sourcePriceKobo: source ? Math.round(Number(source) * 100) : null,
          sourceLocation,
          images: imageUrls,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Unable to create product');
      onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to create product');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Create product" onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Product name" value={name} onChange={setName} />
        <Field label="Brand" value={brand} onChange={setBrand} />
        <Field label="Retail price (₦)" value={price} onChange={setPrice} />
        <Field label="Supplier price (₦)" value={source} onChange={setSource} />
        <Field label="Source location" value={sourceLocation} onChange={setSourceLocation} />
        <label className="block">
          <span className="text-xs font-bold text-white/45">Category</span>
          <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#121522] px-3 py-3 text-sm text-white">
            <option value="">Select category</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-bold text-white/45">Supplier</span>
          <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#121522] px-3 py-3 text-sm text-white">
            <option value="">Select supplier</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="sm:col-span-2 block">
          <span className="text-xs font-bold text-white/45">Description</span>
          <textarea value={description} onChange={e => setDescription(e.target.value)} className="mt-1.5 min-h-24 w-full rounded-xl border border-white/10 bg-[#121522] px-3 py-3 text-sm text-white" />
        </label>

        {/* Image upload */}
        <div className="sm:col-span-2">
          <span className="text-xs font-bold text-white/45">Product images (up to 6)</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {imagePreviews.map((src, i) => (
              <div key={i} className="relative">
                <img src={src} alt="" className="h-20 w-20 rounded-lg object-cover border border-white/10" />
                <button type="button" onClick={() => removeImage(i)} className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-red-500 text-white text-xs">×</button>
              </div>
            ))}
            {imageFiles.length < 6 && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="grid h-20 w-20 place-items-center rounded-lg border border-dashed border-white/20 text-white/40 hover:border-[#7d69ff] hover:text-[#c2baff] transition"
              >
                <Plus size={22} />
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
          {uploading && <p className="mt-2 text-xs text-[#b9b0ff] animate-pulse">Uploading images to Cloudinary…</p>}
          {imageFiles.length === 0 && <p className="mt-1.5 text-xs text-white/30">Click + to choose product photos</p>}
        </div>

        <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-white/10 px-4 py-3 font-bold text-white/70">Cancel</button>
          <button disabled={busy || imageFiles.length === 0} className="rounded-xl bg-[#5b35f5] px-5 py-3 font-bold disabled:opacity-50">
            {uploading ? 'Uploading…' : busy ? 'Publishing…' : 'Publish product'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function SupplierCreateModal({ onClose, onCreated, onError }: { onClose:()=>void; onCreated:()=>void; onError:(s:string)=>void }) { const [name,setName]=useState(''); const [location,setLocation]=useState(''); const [phone,setPhone]=useState(''); const [notes,setNotes]=useState(''); const [busy,setBusy]=useState(false); const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);try{const r=await fetch('/api/admin/suppliers',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,location,phone,notes})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to save supplier');onCreated()}catch(err){onError(err instanceof Error?err.message:'Unable to save supplier')}finally{setBusy(false)}}; return <Modal title="Add supplier" onClose={onClose}><form onSubmit={submit} className="grid gap-4"><Field label="Supplier / store name" value={name} onChange={setName}/><Field label="Location" value={location} onChange={setLocation}/><Field label="Phone / WhatsApp" value={phone} onChange={setPhone}/><label><span className="text-xs font-bold text-white/45">Notes</span><textarea value={notes} onChange={e=>setNotes(e.target.value)} className="mt-1.5 min-h-28 w-full rounded-xl border border-white/10 bg-[#121522] px-3 py-3 text-sm"/></label><button disabled={busy} className="rounded-xl bg-[#5b35f5] px-4 py-3 font-bold">{busy?'Saving…':'Save supplier'}</button></form></Modal>; }
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){return <div className="fixed inset-0 z-[110] grid place-items-center bg-black/60 p-4"><div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0d0f1a] p-6 shadow-2xl"><div className="mb-6 flex items-center justify-between"><h2 className="text-xl font-black">{title}</h2><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10"><X size={17}/></button></div>{children}</div></div>}
function Field({label,value,onChange}:{label:string;value:string;onChange:(v:string)=>void}){return <label className="block"><span className="text-xs font-bold text-white/45">{label}</span><input required value={value} onChange={e=>onChange(e.target.value)} className="mt-1.5 w-full rounded-xl border border-white/10 bg-[#121522] px-3 py-3 text-sm text-white outline-none focus:border-[#7d69ff]"/></label>}
