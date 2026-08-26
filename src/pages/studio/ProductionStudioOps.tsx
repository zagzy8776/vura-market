import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Package, RefreshCw, Search } from 'lucide-react';
import { money } from '@/lib/money';
import type { Customer, Notification, Order, Overview, Product, ResourceState, StudioTab, Supplier } from '@/types';
import { OperationalOrders, OperationalProducts, OperationalSuppliers } from './StudioOperationalTables';
import AdminOverview from './AdminOverview';

async function request<T>(url: string): Promise<{ data: T; requestId?: string }> {
  const r = await fetch(url, { credentials: 'include' });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(b?.error || `Request failed (${r.status})`);
    (err as any).requestId = r.headers.get('X-Request-ID') || undefined;
    throw err;
  }
  return { data: b as T, requestId: r.headers.get('X-Request-ID') || undefined };
}

/**
 * Load a resource.
 * - First load / hard retry: show loading UI
 * - Background refresh (interval): keep current UI + form state, just swap data when done
 */
function makeLoader<T>(
  setState: (s: ResourceState<T>) => void,
  getState: () => ResourceState<T>,
  fetchFn: () => Promise<T>,
  errorLabel: string,
) {
  return async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent && getState().state === 'success';
    if (!silent) setState({ state: 'loading' });
    try {
      const data = await fetchFn();
      setState({ state: 'success', data });
    } catch (e) {
      // On silent refresh failure, keep existing success data instead of wiping the form
      if (silent && getState().state === 'success') return;
      setState({
        state: 'error',
        error: e instanceof Error ? e.message : errorLabel,
        requestId: (e as any).requestId,
      });
    }
  };
}

export default function ProductionStudioOps({ tab, onTabChange }: { tab: StudioTab; onTabChange: (tab: StudioTab) => void }) {
  const [q, setQ] = useState('');
  const [overview, setOverview] = useState<ResourceState<Overview>>({ state: 'idle' });
  const [orders, setOrders] = useState<ResourceState<Order[]>>({ state: 'idle' });
  const [products, setProducts] = useState<ResourceState<Product[]>>({ state: 'idle' });
  const [suppliers, setSuppliers] = useState<ResourceState<Supplier[]>>({ state: 'idle' });
  const [notifications, setNotifications] = useState<ResourceState<Notification[]>>({ state: 'idle' });

  // refs so silent loaders always read latest state without stale closures
  const overviewRef = { current: overview }; overviewRef.current = overview;
  const ordersRef = { current: orders }; ordersRef.current = orders;
  const productsRef = { current: products }; productsRef.current = products;
  const suppliersRef = { current: suppliers }; suppliersRef.current = suppliers;
  const notificationsRef = { current: notifications }; notificationsRef.current = notifications;

  const loadOverview = makeLoader(setOverview, () => overviewRef.current, async () => (await request<Overview>('/api/admin/overview')).data, 'Failed to load overview');
  const loadOrders = makeLoader(setOrders, () => ordersRef.current, async () => (await request<{ orders: Order[] }>('/api/admin/orders')).data.orders || [], 'Failed to load orders');
  const loadProducts = makeLoader(setProducts, () => productsRef.current, async () => (await request<{ products: Product[] }>('/api/admin/products')).data.products || [], 'Failed to load products');
  const loadSuppliers = makeLoader(setSuppliers, () => suppliersRef.current, async () => (await request<{ suppliers: Supplier[] }>('/api/admin/suppliers')).data.suppliers || [], 'Failed to load suppliers');
  const loadNotifications = makeLoader(setNotifications, () => notificationsRef.current, async () => (await request<{ notifications: Notification[] }>('/api/admin/notifications')).data.notifications || [], 'Failed to load notifications');

  const loadAll = async (opts?: { silent?: boolean }) => {
    await Promise.all([
      loadOverview(opts),
      loadOrders(opts),
      loadProducts(opts),
      loadSuppliers(opts),
      loadNotifications(opts),
    ]);
  };

  useEffect(() => {
    void loadAll(); // first load — show spinners
    // background poll every 30s — silent so open product modal is never unmounted
    const id = window.setInterval(() => void loadAll({ silent: true }), 30000);
    return () => window.clearInterval(id);
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
              <button onClick={() => void loadAll()} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10" aria-label="Refresh">
                <RefreshCw size={17} className={isLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </header>
          <div className="p-5 md:p-8">
            {tab === 'overview' && <AdminOverview state={overview} onNavigate={onTabChange} onRefresh={() => loadOverview()} />}
            {tab === 'orders' &&
              (orders.state === 'loading' ? (
                <Loading />
              ) : orders.state === 'error' ? (
                <ErrorState error={orders.error} requestId={orders.requestId} onRetry={() => loadOrders()} />
              ) : (
                <OperationalOrders orders={orders.state === 'success' ? orders.data : []} suppliers={suppliersData} onRefresh={() => loadOrders()} />
              ))}
            {tab === 'payments' && <Payments state={orders} />}
            {tab === 'products' &&
              (products.state === 'loading' ? (
                <Loading />
              ) : products.state === 'error' ? (
                <ErrorState error={products.error} requestId={products.requestId} onRetry={() => loadProducts()} />
              ) : (
                <OperationalProducts products={products.state === 'success' ? products.data : []} suppliers={suppliersData} onRefresh={() => loadProducts()} />
              ))}
            {tab === 'sourcing' && <Sourcing state={orders} />}
            {tab === 'suppliers' &&
              (suppliers.state === 'loading' ? (
                <Loading />
              ) : suppliers.state === 'error' ? (
                <ErrorState error={suppliers.error} requestId={suppliers.requestId} onRetry={() => loadSuppliers()} />
              ) : (
                <OperationalSuppliers suppliers={suppliers.state === 'success' ? suppliers.data : []} onRefresh={() => loadSuppliers()} />
              ))}
            {tab === 'customers' && <Customers customers={customersData} />}
            {tab === 'notifications' && <Notifications state={notifications} />}
            {tab === 'audit' && <AuditView state={overview} />}
            {(tab === 'health' || tab === 'inventory' || tab === 'delivery' || tab === 'analytics' || tab === 'settings') && <ComingSoon tab={tab} />}
          </div>
        </section>
      </div>
    </main>
  );
}

function Payments({ state }: { state: ResourceState<Order[]> }) {
  if (state.state === 'loading') return <Loading />;
  if (state.state === 'error') return <ErrorState error={state.error} requestId={state.requestId} />;
  if (state.state !== 'success') return <Empty text="No payment data." />;
  const orders = state.data;
  const pending = orders.filter((x) => x.payment_status === 'pending_verification');
  const paid = orders.filter((x) => x.payment_status === 'paid');
  return (
    <>
      <Header title="Payments" subtitle="Payment verification and paid-order visibility." />
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Stat label="Pending verification" value={String(pending.length)} />
        <Stat label="Paid orders" value={String(paid.length)} />
        <Stat label="Paid volume" value={money(paid.reduce((n, x) => n + Number(x.total_kobo), 0))} />
      </div>
      <Card className="mt-6 p-5">
        <b>Verification queue</b>
        <div className="mt-4 space-y-2">
          {pending.map((x) => (
            <div key={x.id} className="flex justify-between border-b border-white/5 py-3">
              <span>
                <b>{x.order_number}</b>
                <small className="block text-white/35">{x.delivery_name}</small>
              </span>
              <b>{money(x.total_kobo)}</b>
            </div>
          ))}
          {!pending.length && <Empty text="No payments awaiting verification." />}
        </div>
      </Card>
    </>
  );
}

function Sourcing({ state }: { state: ResourceState<Order[]> }) {
  if (state.state === 'loading') return <Loading />;
  if (state.state === 'error') return <ErrorState error={state.error} requestId={state.requestId} />;
  if (state.state !== 'success') return <Empty text="No sourcing data." />;
  const rows = state.data.filter((x) => x.payment_status === 'paid' && !['delivered', 'cancelled'].includes(x.status));
  return (
    <>
      <Header title="Sourcing & delivery" subtitle="Paid orders awaiting purchasing, dispatch or delivery completion." />
      <Card className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr>
              {['Order', 'Customer', 'Product', 'Supplier', 'Status', 'Total'].map((x) => (
                <th key={x} className="border-b border-white/10 px-4 py-3 text-left text-xs text-white/35">
                  {x}
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
                <td className="px-4">{x.supplier_name || 'Unassigned'}</td>
                <td className="px-4">
                  <Pill value={x.sourcing_status || x.status} />
                </td>
                <td className="px-4 font-bold">{money(x.total_kobo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <Empty text="No sourcing work queued." />}
      </Card>
    </>
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
        {!customers.length && <Empty text="No customers found." />}
      </Card>
    </>
  );
}

function Notifications({ state }: { state: ResourceState<Notification[]> }) {
  if (state.state === 'loading') return <Loading />;
  if (state.state === 'error') return <ErrorState error={state.error} requestId={state.requestId} />;
  if (state.state !== 'success') return <Empty text="No notifications." />;
  return (
    <>
      <Header title="Notifications" subtitle="System and customer notification records." />
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
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <div className="text-[11px] font-bold uppercase tracking-wider text-white/30">{label}</div>
      <div className="mt-3 text-2xl font-black">{value}</div>
    </Card>
  );
}
function Pill({ value }: { value: string }) {
  return <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-bold capitalize">{String(value || '—').replaceAll('_', ' ')}</span>;
}
function ComingSoon({ tab }: { tab: StudioTab }) {
  const labels = {
    health: 'Health & Alerts',
    inventory: 'Inventory Management',
    delivery: 'Fulfillment & Delivery',
    analytics: 'Analytics Dashboard',
    settings: 'Settings & Admin Panel',
  };
  return (
    <div>
      <Header title={labels[tab as keyof typeof labels] || 'Coming Soon'} subtitle="This feature is currently in development." />
      <div className="mt-12 grid min-h-[50vh] place-items-center rounded-2xl border border-white/10 bg-white/[.025]">
        <div className="text-center">
          <Package className="mx-auto mb-4 text-white/30" size={32} />
          <p className="text-white/50">Feature under development</p>
          <p className="mt-2 text-sm text-white/30">Check back soon</p>
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
