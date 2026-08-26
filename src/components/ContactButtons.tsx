import { Phone } from 'lucide-react';
import { orderWhatsAppText, telHref, waHref } from '@/lib/phone';

export default function ContactButtons({
  phone,
  orderNumber,
  kind = 'order',
  compact = false,
}: {
  phone?: string | null;
  orderNumber?: string | null;
  kind?: 'order' | 'payment' | 'delivery';
  compact?: boolean;
}) {
  const call = telHref(phone);
  const wa = waHref(phone, orderWhatsAppText(orderNumber, kind));
  if (!call && !wa) {
    return compact ? null : <span className="text-xs text-white/30">No phone</span>;
  }

  const btn = compact
    ? 'inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] font-bold hover:bg-white/5'
    : 'inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[.04] px-3 py-1.5 text-xs font-bold hover:bg-white/10';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {call && (
        <a href={call} className={btn}>
          <Phone size={13} />
          Call
        </a>
      )}
      {wa && (
        <a href={wa} target="_blank" rel="noreferrer" className={`${btn} border-emerald-400/25 text-emerald-200`}>
          WhatsApp
        </a>
      )}
    </div>
  );
}
