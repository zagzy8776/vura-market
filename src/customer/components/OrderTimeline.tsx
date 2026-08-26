import { CheckCircle2, Circle, PackageCheck, Truck } from 'lucide-react';
import { formatDateTime } from '../lib/availability';
import type { TrackingEvent, Shipment } from '@/types';

const STAGE_ORDER = ['awaiting_payment', 'payment_verification', 'confirmed', 'sourcing', 'purchased', 'out_for_delivery', 'delivered'];

export function statusLabel(status: string): string {
  switch (status) {
    case 'awaiting_payment': return 'Awaiting payment';
    case 'pending_verification': return 'Payment verification';
    case 'payment_verification': return 'Verifying payment';
    case 'unpaid': return 'Unpaid';
    case 'paid': return 'Paid';
    case 'rejected': return 'Payment rejected';
    case 'confirmed': return 'Confirmed';
    case 'sourcing': return 'Sourcing';
    case 'purchased': return 'Purchased';
    case 'ready_for_dispatch': return 'Ready for dispatch';
    case 'out_for_delivery': return 'Dispatched';
    case 'dispatched': return 'Dispatched';
    case 'in_transit': return 'In transit';
    case 'delivered': return 'Delivered';
    case 'cancelled': return 'Cancelled';
    case 'failed': return 'Delivery failed';
    default: return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export function OrderTimeline({ orderStatus, events, shipments }: { orderStatus: string; events: TrackingEvent[]; shipments?: Shipment[] }) {
  const currentIdx = Math.max(STAGE_ORDER.indexOf(orderStatus), events.length - 1);
  const stages = events.length > 0
    ? events.map((e) => ({ done: true, label: statusLabel(e.status) + (e.message ? ` — ${e.message}` : ''), time: formatDateTime(e.created_at), location: e.location || undefined, current: false }))
    : STAGE_ORDER.map((stage, idx) => ({
        done: currentIdx >= idx,
        label: statusLabel(stage),
        time: '',
        location: undefined as string | undefined,
        current: currentIdx === idx,
      }));

  return (
    <div>
      <ol className="relative space-y-0" aria-label="Order progress">
        {stages.map((stage, i) => {
          const isLast = i === stages.length - 1;
          const active = stage.current || (i === stages.length - 1 && !stages.some((s) => s.current));
          return (
            <li key={`${stage.label}-${i}`} className="relative flex gap-4 pb-6 last:pb-0">
              {!isLast && <span className={`absolute left-[13px] top-7 h-full w-px ${stage.done ? 'bg-vura-500/50' : 'bg-white/10'}`} aria-hidden />}
              <span className="relative z-10 mt-0.5 shrink-0">
                {stage.done ? (
                  active
                    ? <span className="grid h-7 w-7 place-items-center rounded-full bg-vura-500 text-white shadow-lg shadow-vura-500/40"><Truck size={14} aria-hidden /></span>
                    : <CheckCircle2 size={26} className="text-vura-400" aria-hidden />
                ) : (
                  <Circle size={24} className="text-low" aria-hidden />
                )}
              </span>
              <div className="min-w-0 pt-1">
                <p className={`text-sm font-bold ${active ? 'text-hi' : stage.done ? 'text-mid' : 'text-low'}`}>{stage.label}</p>
                {stage.location && <p className="text-xs font-semibold text-vura-300">{stage.location}</p>}
                {stage.time && <p className="mt-0.5 text-xs text-low">{stage.time}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      {shipments && shipments.length > 0 && (
        <div className="mt-6 space-y-3 border-t border-white/8 pt-5">
          <p className="flex items-center gap-2 text-sm font-bold text-hi"><PackageCheck size={16} className="text-vura-300" aria-hidden /> Shipments</p>
          {shipments.map((shipment, i) => (
            <div key={shipment.id} className="rounded-xl border border-white/8 bg-surface/60 p-4">
              <p className="text-sm font-bold text-hi">Shipment {shipments.length > 1 ? i + 1 : ''} {shipment.supplier_name ? `· ${shipment.supplier_name}` : ''}</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <dt className="text-low">Status</dt>
                <dd className="font-semibold text-hi">{statusLabel(shipment.status)}</dd>
                {shipment.tracking_number && (<><dt className="text-low">Tracking #</dt><dd className="font-mono font-semibold text-hi">{shipment.tracking_number}</dd></>)}
                {shipment.courier_name && (<><dt className="text-low">Courier</dt><dd className="font-semibold text-hi">{shipment.courier_name}</dd></>)}
              </dl>
              {shipment.events && shipment.events.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-white/6 pt-3">
                  {[...shipment.events].reverse().map((event) => (
                    <li key={event.id} className="text-xs text-mid">
                      <b className="text-hi">{statusLabel(event.status)}</b>
                      {event.message ? ` — ${event.message}` : ''}
                      {event.location ? ` · ${event.location}` : ''}
                      <span className="ml-1 text-low">({formatDateTime(event.createdAt)})</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
