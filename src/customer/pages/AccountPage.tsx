import { useEffect, useMemo, useState } from 'react';
import { Bell, Heart, LogOut, PackageSearch, User } from 'lucide-react';
import { Link, useRouter } from '../router';
import { useAuth } from '@/context/AuthContext';
import { useWishlist } from '../context/WishlistContext';
import { storefrontApi } from '../lib/api';
import type { CustomerOrder, StorefrontProduct } from '@/types';
import { money } from '@/lib/money';
import { Button, EmptyState, ErrorState, Skeleton } from '../components/ui';
import { ProductCard } from '../components/ProductCard';
import { PaymentChip, StatusChip } from './TrackPage';
import { formatDate } from '../lib/availability';

const TABS = [
  { key: 'orders', label: 'Orders', icon: <PackageSearch size={16} /> },
  { key: 'wishlist', label: 'Wishlist', icon: <Heart size={16} /> },
  { key: 'notifications', label: 'Notifications', icon: <Bell size={16} /> },
  { key: 'profile', label: 'Profile', icon: <User size={16} /> },
] as const;

export type AccountTab = (typeof TABS)[number]['key'];

export function AccountPage({ tab }: { tab: AccountTab }) {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.navigate(`/signin?next=/account/${tab}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  if (loading || !user) {
    return (
      <main id="main" className="mx-auto max-w-5xl px-4 py-10">
        <Skeleton className="h-10 w-48" />
        <div className="mt-8 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      </main>
    );
  }

  return (
    <main id="main" className="mx-auto max-w-5xl px-4 py-10 md:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-vura-300">My Vura</p>
          <h1 className="mt-1 font-display text-3xl font-black tracking-tight text-hi">Hello, {user.name.split(' ')[0]}</h1>
        </div>
        <Button variant="ghost" onClick={() => void signOut().then(() => router.navigate('/'))}><LogOut size={15} /> Sign out</Button>
      </header>

      <nav aria-label="Account sections" className="mt-8 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <Link
            key={t.key}
            to={`/account/${t.key}`}
            className={`flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition ${tab === t.key ? 'border-vura-500 bg-vura-500/12 text-vura-200' : 'border-white/10 bg-white/[0.03] text-mid hover:text-hi'}`}
            aria-current={tab === t.key ? 'page' : undefined}
          >
            {t.icon} {t.label}
          </Link>
        ))}
      </nav>

      <div className="mt-8">
        {tab === 'orders' && <OrdersTab />}
        {tab === 'wishlist' && <WishlistTab />}
        {tab === 'notifications' && <NotificationsTab />}
        {tab === 'profile' && <ProfileTab />}
      </div>
    </main>
  );
}

function OrdersTab() {
  const router = useRouter();
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    storefrontApi.orders().then((r) => setOrders(r.orders)).catch(() => setFailed(true));
  }, []);

  if (failed) return <ErrorState onRetry={() => window.location.reload()} />;
  if (!orders) return <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>;
  if (!orders.length) return <EmptyState icon={<PackageSearch size={26} />} title="No orders yet" description="Your purchases and their live tracking will appear here." action={<Link to="/search"><Button>Start shopping</Button></Link>} />;

  return (
    <ul className="space-y-3">
      {orders.map((order) => (
        <li key={order.id}>
          <button onClick={() => router.navigate(`/track/${order.id}`)} className="w-full rounded-2xl border border-white/8 bg-surface/60 p-5 text-left transition hover:border-vura-400/40">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm font-bold text-vura-300">{order.order_number}</span>
              <span className="text-xs font-semibold text-low">{formatDate(order.created_at)}</span>
            </div>
            <p className="mt-1.5 truncate text-sm font-bold text-hi">{order.product_name}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <PaymentChip payment={order.payment_status} />
              <StatusChip status={order.status} />
              <b className="ml-auto text-sm text-hi">{money(order.total_kobo)}</b>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function WishlistTab() {
  const wishlist = useWishlist();
  const [products, setProducts] = useState<StorefrontProduct[] | null>(null);
  const [failed, setFailed] = useState(false);

  const ids = useMemo(() => wishlist.ids.join(','), [wishlist.ids]);

  useEffect(() => {
    if (!ids) {
      setProducts([]);
      return;
    }
    let cancelled = false;
    storefrontApi.products({ ids: ids.split(','), perPage: 60 })
      .then((r) => !cancelled && setProducts(r.products))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [ids]);

  if (failed) return <ErrorState onRetry={() => window.location.reload()} />;
  if (!products) return <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />)}</div>;
  if (!products.length) return <EmptyState icon={<Heart size={26} />} title="Your wishlist is empty" description="Tap the heart on any product to save it here and watch its price." action={<Link to="/search"><Button>Find something to love</Button></Link>} />;

  return (
    <>
      <p className="mb-4 text-sm text-low">Prices and stock update live from the catalog.</p>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {products.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </>
  );
}

type NotificationRow = { id: string; title: string; body: string; read_at: string | null; created_at: string; order_id?: string | null };

function NotificationsTab() {
  const [items, setItems] = useState<NotificationRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = () => storefrontApi.notifications()
    .then((r) => setItems(r.notifications as unknown as NotificationRow[]))
    .catch(() => setFailed(true));

  useEffect(() => {
    void load();
  }, []);

  const markRead = async (id: string) => {
    await storefrontApi.notificationRead(id).catch(() => undefined);
    setItems((prev) => prev?.map((n) => (n.id === id ? { ...n, read_at: n.read_at || new Date().toISOString() } : n)) || []);
  };

  if (failed) return <ErrorState onRetry={() => window.location.reload()} />;
  if (!items) return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>;
  if (!items.length) return <EmptyState icon={<Bell size={26} />} title="No notifications yet" description="Order updates and deal alerts land here." />;

  return (
    <ul className="space-y-2.5">
      {items.map((n) => (
        <li key={n.id} className={`rounded-2xl border p-4 ${n.read_at ? 'border-white/8 bg-surface/40' : 'border-vura-500/30 bg-vura-500/[0.05]'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-hi">{n.title}</p>
              <p className="mt-0.5 text-sm leading-6 text-mid">{n.body}</p>
              <p className="mt-1.5 text-xs text-low">{formatDate(n.created_at)}</p>
            </div>
            {!n.read_at && <button onClick={() => void markRead(n.id)} className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold text-vura-300 hover:bg-white/[0.06]">Mark read</button>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ProfileTab() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="max-w-lg space-y-4 rounded-2xl border border-white/8 bg-surface/60 p-6">
      <h2 className="font-display text-lg font-bold text-hi">Profile</h2>
      <dl className="space-y-3 text-sm">
        <div><dt className="text-xs font-semibold text-low">Name</dt><dd className="font-bold text-hi">{user.name}</dd></div>
        <div><dt className="text-xs font-semibold text-low">Email</dt><dd className="font-bold text-hi">{user.email}</dd></div>
        <div><dt className="text-xs font-semibold text-low">Role</dt><dd className="font-bold capitalize text-hi">{user.role}</dd></div>
      </dl>
      <p className="rounded-xl bg-white/[0.04] p-4 text-xs leading-5 text-low">
        Need a change? Contact support on WhatsApp and we'll update your details after verifying your identity — keeping account data safe comes first.
      </p>
      <Link to="/help#contact"><Button variant="secondary" size="sm">Contact support</Button></Link>
    </div>
  );
}
