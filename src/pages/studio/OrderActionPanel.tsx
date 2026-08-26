import { useEffect, useState } from 'react';
import { X, Save, ShieldCheck } from 'lucide-react';
import { money } from '@/lib/money';
import ContactButtons from '@/components/ContactButtons';

type AnyOrder = Record<string, any>;
type AnySupplier = Record<string, any>;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

export default function OrderActionPanel({ order, suppliers, onClose, onSaved }: { order: AnyOrder | null; suppliers: AnySupplier[]; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [sourcingStatus, setSourcingStatus] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [purchase, setPurchase] = useState('');
  const [delivery, setDelivery] = useState('');
  const [other, setOther] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!order) return;
    setStatus(order.status || 'awaiting_payment');
    setPaymentStatus(order.payment_status || 'unpaid');
    setSourcingStatus(order.sourcing_status || 'awaiting_confirmation');
    setSupplierId(order.supplier_id || '');
    setPurchase(order.purchase_cost_kobo == null ? '' : String(order.purchase_cost_kobo));
    setDelivery(order.delivery_fee_kobo == null ? '' : String(order.delivery_fee_kobo));
    setOther(order.other_cost_kobo == null ? '' : String(order.other_cost_kobo));
    setMessage('');
  }, [order]);

  if (!order) return null;
  const profit = Number(order.total_kobo || 0) - (Number(purchase || 0) || 0) - (Number(delivery || 0) || 0) - (Number(other || 0) || 0);

  const save = async () => {
    setSaving(true); setMessage('');
    try {
      await api('/api/admin/orders', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.id, status, paymentStatus, sourcingStatus, supplierId: supplierId || null, purchaseCostKobo: purchase === '' ? null : Number(purchase), deliveryFeeKobo: Number(delivery || 0), otherCostKobo: Number(other || 0) }) });
      setMessage('Saved successfully.');
      onSaved();
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not save.'); }
    finally { setSaving(false); }
  };

  return <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm" onMouseDown={e => e.currentTarget === e.target && onClose()}>
    <aside className="ml-auto flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-[#0b0d17] shadow-2xl">
      <header className="flex items-center gap-3 border-b border-white/10 px-5 py-4"><div className="min-w-0 flex-1"><div className="text-xs text-white/35">ORDER OPERATIONS</div><h2 className="truncate text-lg font-black">{order.order_number}</h2></div><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg border border-white/10"><X size={17}/></button></header>
      <div className="flex-1 overflow-y-auto p-5">
        <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
          <div className="font-bold">{order.product_name}</div>
          <div className="mt-1 text-sm text-white/45">{order.delivery_name} · {order.delivery_phone || 'No phone'}</div>
          <div className="mt-2 text-sm text-white/45">{order.delivery_address || 'No address recorded'}</div>
          <div className="mt-3"><ContactButtons phone={order.delivery_phone} orderNumber={order.order_number} kind="order" /></div>
          <div className="mt-4 text-xl font-black">{money(order.total_kobo)}</div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Order status"><select value={status} onChange={e => setStatus(e.target.value)}><option>awaiting_payment</option><option>payment_verification</option><option>confirmed</option><option>sourcing</option><option>purchased</option><option>out_for_delivery</option><option>delivered</option><option>cancelled</option></select></Field>
          <Field label="Payment status"><select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}><option>unpaid</option><option>pending_verification</option><option>paid</option><option>rejected</option></select></Field>
          <Field label="Sourcing status"><select value={sourcingStatus} onChange={e => setSourcingStatus(e.target.value)}><option>awaiting_confirmation</option><option>confirmed</option><option>sourcing</option><option>purchased</option><option>out_for_delivery</option><option>delivered</option><option>cancelled</option></select></Field>
          <Field label="Supplier"><select value={supplierId} onChange={e => setSupplierId(e.target.value)}><option value="">Unassigned</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Purchase cost (kobo)"><input inputMode="numeric" value={purchase} onChange={e => setPurchase(e.target.value)}/></Field>
          <Field label="Delivery cost (kobo)"><input inputMode="numeric" value={delivery} onChange={e => setDelivery(e.target.value)}/></Field>
          <Field label="Other cost (kobo)"><input inputMode="numeric" value={other} onChange={e => setOther(e.target.value)}/></Field>
        </div>
        <div className={`mt-5 rounded-2xl border p-4 ${profit >= 0 ? 'border-emerald-400/20 bg-emerald-400/5' : 'border-red-400/20 bg-red-400/5'}`}><div className="text-xs uppercase tracking-wider text-white/35">Estimated actual profit</div><div className="mt-1 text-2xl font-black">{money(profit)}</div><div className="mt-1 text-xs text-white/35">Calculated from order total minus recorded costs.</div></div>
        <div className="mt-5 flex items-center gap-2 text-xs text-white/35"><ShieldCheck size={14}/> Server-authorized mutation · audit/event recording</div>
        {message && <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-sm">{message}</div>}
      </div>
      <footer className="border-t border-white/10 p-5"><button disabled={saving} onClick={() => void save()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-vura-500 px-4 py-3 font-bold disabled:opacity-50"><Save size={16}/>{saving ? 'Saving…' : 'Save order changes'}</button></footer>
    </aside>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-sm"><span className="mb-1.5 block text-xs font-semibold text-white/45">{label}</span>{children}<style>{`select,input{width:100%;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:#111522;color:white;padding:10px 12px;outline:none}select:focus,input:focus{border-color:#7f6aff}`}</style></label>; }
