import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Package, RefreshCw, Search } from 'lucide-react';
import { money } from '@/lib/money';
import type { Customer, Notification, Order, Overview, Product, ResourceState, StudioTab, Supplier } from '@/types';
import { OperationalOrders, OperationalProducts, OperationalSuppliers } from './StudioOperationalTables';
import AdminOverview from './AdminOverview';
import { PaymentsBoard, InventoryBoard, SourcingBoard, FulfillmentBoard } from './StudioBoards';

async function request<T>(url: string, init?: RequestInit): Promise<{ data: T; requestId?: string }> {
  const r = await fetch(url, { credentials: 'include', ...init });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(b?.error || `Request failed (${r.status})`);
    (err as any).requestId = r.headers.get('X-Request-ID') || undefined;
    throw err;
  }
  return { data: b as T, requestId: r.headers.get('X-Request-ID') || undefined };
}

export default function ProductionStudioOps({ tab, onTabChange }: { tab: StudioTab; onTabChange: (tab: StudioTab) => void }) {
  const [q, setQ] = useState('');
  const [overview, setOverview] = useState<ResourceState<Overview>>({ state: 'idle' });
  const [orders, setOrders] = useState<ResourceState<Order[]>>({ state: 'idle' });
  const [products, setProducts] = useState<ResourceState<Product[]>>({ state: 'idle' });
  const [suppliers, setSuppliers] = useState<ResourceState<Supplier[]>>({ state: 'idle' });
  const [notifications, setNotifications] = useState<ResourceState<Notification[]>>({ state: 'idle' });

  const overviewRef = useRef(overview);
  const ordersRef = useRef(orders);
  const productsRef = useRef(products);
  const suppliersRef = useRef(suppliers);
  const notificationsRef = useRef(notifications);
  overviewRef.current = overview;
  ordersRef.current = orders;
  productsRef.current = products;
  suppliersRef.current = suppliers;
  notificationsRef.current = notifications;

  const productsEverLoaded = useRef(false);
  if (products.state === 'success') productsEverLoaded.current = true;

  const loadOverview = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent && overviewRef.current.state === 'success';
    if (!silent) setOverview({ state: 'loading' });
    try {
      const { data } = await request<Overview>('/api/admin/overview');
      setOverview({ state: 'success', data });
    } catch (e) {
      if (silent) return;
      setOverview({ state: 'error', error: e instanceof Error ? e.message : 'Failed to load overview', requestId: (e as any).requestId });
    }
  };

  const loadOrders = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent && ordersRef.current.state === 'success';
    if (!silent) setOrders({ state: 'loading' });
    try {
      const { data } = await request<{ orders: Order[] }>('/api/admin/orders');
      setOrders({ state: 'success', data: data.orders || [] });
    } catch (e) {
      if (silent) return;
      setOrders({ state: 'error', error: e instanceof Error ? e.message : 'Failed to load orders', requestId: (e as any).requestId });
    }
  };

  const loadProducts = async (opts?: { silent?: boolean }) => {
    const alreadyShown = productsRef.current.state === 'success' || productsEverLoaded.current;
    const silent = opts?.silent || alreadyShown;
    if (!silent) setProducts({ state: 'loading' });
    try {
      const { data } = await request<{ products: Product[] }>('/api/admin/products');
      setProducts({ state: 'success', data: data.products || [] });
    } catch (e) {
      if (silent && productsRef.current.state === 'success') return;
      if (productsRef.current.state === 'success') return;
      setProducts({ state: 'error', error: e instanceof Error ? e.message : 'Failed to load products', requestId: (e as any).requestId });
    }
  };

  const loadSuppliers = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent && suppliersRef.current.state === 'success';
    if (!silent) setSuppliers({ state: 'loading' });
    try {
      const { data } = await request<{ suppliers: Supplier[] }>('/api/admin/suppliers');
      setSuppliers({ state: 'success', data: data.suppliers || [] });
    } catch (e) {
      if (silent) return;
      setSuppliers({ state: 'error', error: e instanceof Error ? e.message : 'Failed to load suppliers', requestId: (e as any).requestId });
    }
  };

  const loadNotifications = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent && notificationsRef.current.state === 'success';
    if (!silent) setNotifications({ state: 'loading' });
    try {
      const { data } = await request<{ notifications: Notification[] }>('/api/admin/notifications');
      setNotifications({ state: 'success', data: data.notifications || [] });
    } catch (e) {
      if (silent) return;
      setNotifications({ state: 'error', error: e instanceof Error ? e.message : 'Failed to load notifications', requestId: (e as any).requestId });
    }
  };

  const loadAll = async (opts?: { silent?: boolean }) => {
    await Promise.all([loadOverview(opts), loadOrders(opts), loadProducts(opts), loadSuppliers(opts), loadNotifications(opts)]);
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const suppliersData = useMemo(
    () => (suppliers.state === 'success' ? suppliers.data.filter((x) => `${x.name} ${x.location} ${x.phone}`.toLowerCase().includes(q.toLowerCase())) : []),
    [suppliers, q],
  );
  const customersData = useMemo(
    () => (overview.state === 'success' ? overview.data.customers?.filter((x) => `${x.name} ${x.email}`.toLowerCase().includes(q.toLowerCase())) || [] : []),
    [overview, q],
  );
  const isLoading =
    overview.state === 'loading' ||
    orders.state === 'loading' ||
    products.state === 'loading' ||
    suppliers.state === 'loading' ||
    notifications.state === 'loading';

  const productsList = products.state === 'success' ? products.data : [];
  const showProductsUi = products.state === 'success' || productsEverLoaded.current;
  const showOrdersUi = orders.state === 'success' || orders.state === 'error';
  const showSuppliersUi = suppliers.state === 'success' || suppliers.state === 'error';

  return (
    <main className="min-h-screen bg-[#080a12] text-white">
      <div className="mx-auto flex min-h-screen max-w-[1800px] flex-col">
        <section className="flex-1">
          <header className="sticky top-0 z-40 border-b border-white/10 bg-[#080a12]/90 backdrop-blur-xl">
            <div className="flex h-[72px] items-center gap-3 px-5 md:px-8">
              <div className="relative max-w-2xl flex-1">
                <Search className="absolute left-3.5 top-3.5 text-white/30" size={17} />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search orders, products, customers, suppliers…"
                  className="w-full rounded-xl border border-white/10 bg-white/[.035] py-3 pl-10 pr-4 text-sm outline-none focus:border-vura-400"
                />
              </div>
              <button onClick={() => void loadAll({ silent: true })} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10" aria-label="Refresh">
                <RefreshCw size={17} className={isLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </header>
          <div className="p-5 md:p-8">
            {tab === 'overview' && <AdminOverview state={overview} onNavigate={onTabChange} onRefresh={() => loadOverview()} />}
            {tab === 'orders' &&
              (orders.state === 'loading' && !showOrdersUi ? (
                <Loading />
              ) : orders.state === 'error' && !showOrdersUi ? (
                <ErrorState error={orders.error} requestId={orders.requestId} onRetry={() => loadOrders()} />
              ) : (
                <OperationalOrders orders={orders.state === 'success' ? orders.data : []} suppliers={suppliersData} onRefresh={() => loadOrders({ silent: true })} />
              ))}
            {tab === 'payments' && <PaymentsBoard state={orders} onRefresh={() => loadOrders({ silent: true })} />}
            {tab === 'products' &&
              (products.state === 'loading' && !showProductsUi ? (
                <Loading />
              ) : products.state === 'error' && !showProductsUi ? (
                <ErrorState error={products.error} requestId={products.requestId} onRetry={() => loadProducts()} />
              ) : (
                <OperationalProducts products={productsList} suppliers={suppliersData} onRefresh={() => loadProducts({ silent: true })} />
              ))}
            {tab === 'sourcing' && <SourcingBoard state={orders} onRefresh={() => loadOrders({ silent: true })} />}
            {tab === 'suppliers' &&
              (suppliers.state === 'loading' && !showSuppliersUi ? (
                <Loading />
              ) : suppliers.state === 'error' && !showSuppliersUi ? (
                <ErrorState error={suppliers.error} requestId={suppliers.requestId} onRetry={() => loadSuppliers()} />
              ) : (
                <OperationalSuppliers suppliers={suppliers.state === 'success' ? suppliers.data : []} onRefresh={() => loadSuppliers({ silent: true })} />
              ))}
            {tab === 'inventory' &&
              (products.state === 'loading' && !showProductsUi ? (
                <Loading />
              ) : (
                <InventoryBoard products={productsList} onRefresh={() => loadProducts({ silent: true })} />
              ))}
            {tab === 'delivery' && <FulfillmentBoard state={orders} onRefresh={() => loadOrders({ silent: true })} />}
            {tab === 'customers' && <Customers customers={customersData} />}
            {tab === 'notifications' && <Notifications state={notifications} />}
            {tab === 'audit' && <AuditView state={overview} />}
            {(tab === 'health' || tab === 'analytics' || tab === 'settings' || tab === 'finance') && <ComingSoon tab={tab} />}
          </div>
        </section>
      </div>
    </main>
  );
}

function Customers({ customers }: { customers: Customer[] }) {
  return (
    <>
      <Header title="Customers" subtitle="Customer accounts and lifetime commercial value." />
      <Card className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr>
              {['Customer', 'Email', 'Orders', 'Lifetime spend'].map((x) => (
                <th key={x} className="border-b border-white/10 px-4 py-3 text-left text-xs text-white/35">
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {customers.map((x) => (
              <tr key={x.id} className="border-b border-white/5">
                <td className="px-4 py-3 font-bold">{x.name}</td>
                <td className="px-4">{x.email}</td>
                <td className="px-4">{x.order_count}</td>
                <td className="px-4 font-bold">{money(x.total_spend_kobo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!customers.length && <div className="py-12 text-center text-sm text-white/30">No customers found.</div>}
      </Card>
    </>
  );
}

function Notifications({ state }: { state: ResourceState<Notification[]> }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [promoMsg, setPromoMsg] = useState('');

  const sendPromo = async () => {
    setSending(true);
    setPromoMsg('');
    try {
      const res = await request<{ ok?: boolean; sent?: number }>('/api/admin/promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      });
      setPromoMsg(`Sent to ${res.data?.sent ?? 0} customers.`);
      setTitle('');
      setBody('');
    } catch (e) {
      setPromoMsg(e instanceof Error ? e.message : 'Could not send promo.');
    } finally {
      setSending(false);
    }
  };

  if (state.state === 'loading') return <Loading />;
  if (state.state === 'error') return <ErrorState error={state.error} requestId={state.requestId} />;
  if (state.state !== 'success') return <Empty text="No notifications." />;
  return (
    <>
      <Header title="Notifications" subtitle="Customer alerts, order updates, and promos." />
      <Card className="mt-6 p-5">
        <b>Send promo / coupon push</b>
        <p className="mt-1 text-sm text-white/45">Pushes to customers who enabled notifications (and logs inbox rows).</p>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title — e.g. Weekend phone deals" className="mt-4 w-full rounded-xl border border-white/10 bg-[#111522] px-3 py-2.5 text-sm outline-none focus:border-vura-500" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message — e.g. Use code VURA10 for 10% off selected phones." rows={3} className="mt-3 w-full rounded-xl border border-white/10 bg-[#111522] px-3 py-2.5 text-sm outline-none focus:border-vura-500" />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" disabled={sending || title.trim().length < 3 || body.trim().length < 3} onClick={() => void sendPromo()} className="rounded-xl bg-vura-500 px-4 py-2.5 text-sm font-bold disabled:opacity-50">
            {sending ? 'Sending…' : 'Send to customers'}
          </button>
          {promoMsg && <span className="text-sm text-white/50">{promoMsg}</span>}
        </div>
      </Card>
      <div className="mt-6 space-y-3">
        {state.data.map((x) => (
          <Card key={x.id} className="p-4">
            <div className="flex justify-between">
              <b>{x.title}</b>
              <small className="text-white/30">{new Date(x.created_at).toLocaleString('en-NG')}</small>
            </div>
            <p className="mt-1 text-sm text-white/55">{x.body}</p>
            <small className="text-white/30">
              {x.user_email || 'System'}
              {x.order_number ? ` · ${x.order_number}` : ''}
            </small>
          </Card>
        ))}
        {!state.data.length && <Empty text="No notification records yet." />}
      </div>
    </>
  );
}

function AuditView({ state }: { state: ResourceState<Overview> }) {
  if (state.state === 'loading') return <Loading />;
  if (state.state === 'error') return <ErrorState error={state.error} requestId={state.requestId} />;
  if (state.state !== 'success') return <Empty text="No audit data." />;
  const { audit = [], orderEvents = [] } = state.data;
  return (
    <>
      <Header title="Audit log" subtitle="Immutable operational history for admin actions and order state changes." />
      <Card className="mt-6 p-5">
        <b>Admin changes</b>
        <div className="mt-4 space-y-3">
          {audit.map((x) => (
            <div key={x.id} className="border-b border-white/5 pb-3 text-sm">
              <b>{x.actor_name || 'System'}</b> · {x.action} · {x.entity_type}
              {x.entity_id ? ` #${x.entity_id}` : ''}
              <div className="text-xs text-white/35">{new Date(x.created_at).toLocaleString('en-NG')}</div>
            </div>
          ))}
          {!audit.length && <Empty text="No audit events." />}
        </div>
      </Card>
      <Card className="mt-6 p-5">
        <b>Order events</b>
        <div className="mt-4 space-y-3">
          {orderEvents.map((x) => (
            <div key={x.id} className="border-b border-white/5 pb-3 text-sm">
              <b>{x.actor_name || 'System'}</b> · {x.event_type} · {x.order_number || x.order_id}
              <div className="text-xs text-white/35">{new Date(x.created_at).toLocaleString('en-NG')}</div>
            </div>
          ))}
          {!orderEvents.length && <Empty text="No order events." />}
        </div>
      </Card>
    </>
  );
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
function ErrorState({ error, requestId, onRetry }: { error: string; requestId?: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-4">
      <div className="text-sm text-red-200">
        <b>Error:</b> {error}
      </div>
      {requestId && <div className="mt-2 text-xs text-red-300/60">Request ID: {requestId}</div>}
      {onRetry && (
        <button onClick={onRetry} className="mt-3 rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/30">
          Retry
        </button>
      )}
    </div>
  );
}
function ComingSoon({ tab }: { tab: StudioTab }) {
  const labels: Record<string, string> = {
    health: 'Health & Alerts',
    analytics: 'Analytics Dashboard',
    settings: 'Settings & Admin Panel',
    finance: 'Finance',
  };
  return (
    <div>
      <Header title={labels[tab] || 'Coming Soon'} subtitle="This feature is currently in development." />
      <div className="mt-12 grid min-h-[50vh] place-items-center rounded-2xl border border-white/10 bg-white/[.025]">
        <div className="text-center">
          <Package className="mx-auto mb-4 text-white/30" size={32} />
          <p className="text-white/50">Feature under development</p>
        </div>
      </div>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="py-12 text-center text-sm text-white/30">
      <Package className="mx-auto mb-2" size={26} />
      {text}
    </div>
  );
}
function Loading() {
  return (
    <div className="grid min-h-[50vh] place-items-center text-white/40">
      <RefreshCw className="animate-spin" size={18} />
    </div>
  );
}
