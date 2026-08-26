import { useEffect, useState } from 'react';
import { ArrowLeft, Truck } from 'lucide-react';
import { Link, useRouter } from '../router';
import { storefrontApi } from '../lib/api';
import type { CustomerOrder, Shipment } from '@/types';
import { money } from '@/lib/money';
import { ErrorState, Skeleton } from '../components/ui';
import { OrderTimeline } from '../components/OrderTimeline';
import type { TrackingEvent } from '@/types';
import { formatDate } from '../lib/availability';

export function TrackDetailPage({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [data, setData] = useState<{ order: CustomerOrder; events: TrackingEvent[]; shipments: Shipment[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    storefrontApi.tracking(orderId)
      .then((result) => !cancelled && setData({ order: result.order as CustomerOrder, events: result.events as TrackingEvent[], shipments: (result.shipments || []) as Shipment[] }))
      .catch((err) => {
        if (cancelled) return;
        if ((err as Error & { status?: number }).status === 404) setNotFound(true);
        else setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-10 md:px-6">
      <button onClick={() => router.navigate('/track')} className="mb-6 inline-flex items-center gap-1.5 text-sm font-bold text-low transition hover:text-hi">
        <ArrowLeft size={15} /> All orders
      </button>

      {failed && <ErrorState onRetry={() => window.location.reload()} />}
      {notFound && <ErrorState title="Order not found" description="This order does not belong to your account." onRetry={() => router.navigate('/track')} />}

      {!data && !failed && !notFound && (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-3xl" />
          <div className="space-y-3 rounded-3xl border border-white/8 bg-surface/60 p-6">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        </div>
      )}

      {data && (
        <>
          <header className="rounded-3xl border border-white/8 bg-surface/60 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="font-mono text-xl font-bold text-vura-300">{data.order.order_number}</h1>
              <span className="text-xs font-semibold text-low">Placed {formatDate(data.order.created_at)}</span>
            </div>
            <p className="mt-1.5 text-sm font-bold text-hi">{data.order.product_name}</p>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-low">Quantity</dt><dd className="font-bold text-hi">{data.order.quantity}</dd></div>
              <div><dt className="text-xs text-low">Delivery</dt><dd className="font-bold text-hi">{money(Number(data.order.delivery_fee_kobo))}</dd></div>
              <div><dt className="text-xs text-low">Total</dt><dd className="font-display font-bold text-vura-300">{money(data.order.total_kobo)}</dd></div>
              <div className="col-span-2 sm:col-span-3"><dt className="text-xs text-low">Deliver to</dt><dd className="font-semibold text-hi">{[data.order.delivery_name, data.order.delivery_city].filter(Boolean).join(' · ')}</dd></div>
            </dl>
          </header>

          <section className="mt-6 rounded-3xl border border-white/8 bg-surface/60 p-6" aria-label="Tracking timeline">
            <h2 className="mb-5 flex items-center gap-2 font-display text-lg font-bold text-hi"><Truck size={18} className="text-vura-300" aria-hidden /> Live tracking</h2>
            <OrderTimeline orderStatus={String(data.order.status)} events={data.events} shipments={data.shipments} />
          </section>

          {!data.events.length && !data.shipments.length && (
            <p className="mt-4 rounded-2xl border border-dashed border-white/10 p-5 text-center text-sm text-low">
              Detailed tracking appears here once the order is confirmed and prepared.
            </p>
          )}

          <p className="mt-6 text-center text-sm text-mid">
            Questions about this order? <Link to="/help" className="font-bold text-vura-300 hover:text-vura-200">Contact support</Link>
          </p>
        </>
      )}
    </main>
  );
}

