import { useEffect, useState } from 'react';
import { PackageSearch } from 'lucide-react';
import { Link, useRouter } from '../router';
import { useAuth } from '@/context/AuthContext';
import { storefrontApi } from '../lib/api';
import type { CustomerOrder } from '@/types';
import { money } from '@/lib/money';
import { Button, EmptyState, ErrorState, Skeleton } from '../components/ui';
import { statusLabel } from '../components/OrderTimeline';
import { formatDate } from '../lib/availability';

export function TrackPage() {
  const router = useRouter();
  const orderId = router.query.get('orderId') || '';

  if (!useAuth().user) {
    return (
      <main id="main" className="mx-auto max-w-2xl px-4 py-20">
        <div className="rounded-3xl border border-white/8 bg-surface/60 p-8 text-center">
          <h1 className="font-display text-3xl font-black tracking-tight text-hi">Track your order</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-mid">
            Order tracking is tied to the email used at checkout for security. Sign in to see live progress, or check the tracking link in your order emails.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/signin?next=/track"><Button size="lg">Sign in</Button></Link>
            <Link to="/help"><Button size="lg" variant="secondary">Need help?</Button></Link>
          </div>
        </div>
      </main>
    );
  }
  return <TrackAuthed initialOrderId={orderId} />;
}

function TrackAuthed({ initialOrderId }: { initialOrderId: string }) {
  const router = useRouter();
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    storefrontApi.orders()
      .then((r) => setOrders(r.orders))
      .catch(() => setFailed(true));
  }, []);

  return (
    <main id="main" className="mx-auto max-w-4xl px-4 py-10 md:px-6">
      <h1 className="font-display text-3xl font-black tracking-tight text-hi sm:text-4xl">Your orders</h1>
      <p className="mt-2 text-sm text-mid">Select an order to see live tracking and shipment details.</p>
      {failed && <div className="mt-8"><ErrorState onRetry={() => window.location.reload()} /></div>}
      {!orders && !failed && (
        <div className="mt-8 space-y-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>
      )}
      {orders?.length === 0 && (
        <div className="mt-10">
          <EmptyState icon={<PackageSearch size={26} />} title="No orders yet" description="When you place an order it appears here with live tracking." action={<Link to="/search"><Button>Start shopping</Button></Link>} />
        </div>
      )}
      {orders && orders.length > 0 && (
        <ul className="mt-8 space-y-3">
          {orders.map((order) => (
            <li key={order.id}>
              <button
                onClick={() => router.navigate(`/track/${order.id}`)}
                className={`w-full rounded-2xl border p-5 text-left transition hover:border-vura-400/40 ${initialOrderId === order.id ? 'border-vura-500/50 bg-vura-500/[0.05]' : 'border-white/8 bg-surface/60'}`}
              >
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
      )}
    </main>
  );
}

export function PaymentChip({ payment }: { payment: string }) {
  const tone = payment === 'paid' ? 'bg-emerald-400/10 text-emerald-300 border-emerald-400/25' : payment === 'rejected' ? 'bg-red-400/10 text-red-300 border-red-400/25' : 'bg-amber-400/10 text-amber-300 border-amber-400/25';
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${tone}`}>{statusLabel(payment)}</span>;
}

export function StatusChip({ status }: { status: string }) {
  const done = status === 'delivered';
  const cancelled = status === 'cancelled';
  const tone = done ? 'bg-emerald-400/10 text-emerald-300 border-emerald-400/25' : cancelled ? 'bg-red-400/10 text-red-300 border-red-400/25' : 'bg-vura-500/12 text-vura-300 border-vura-500/30';
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${tone}`}>{statusLabel(status)}</span>;
}
