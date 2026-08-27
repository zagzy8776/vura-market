import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, Copy, Lock, ShieldCheck, ShoppingCart } from 'lucide-react';
import { Link, useRouter } from '../router';
import { useAuth } from '@/context/AuthContext';
import { useCart, type CartIssue } from '../context/CartContext';
import { storefrontApi } from '../lib/api';
import type { DeliveryQuote, NigeriaLga, NigeriaState } from '@/types';
import { money } from '@/lib/money';
import { Button, EmptyState, ErrorState, Field, Input, Select, Textarea } from '../components/ui';
import { optimizedImage } from '../lib/images';
import { track } from '../lib/analytics';

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS = ['Customer', 'Delivery', 'Review', 'Payment'];

type CheckoutResult = {
  orders: Array<{ id: string; order_number: string; total_kobo: number }>;
  totals: { subtotalKobo: number; deliveryKobo: number; totalKobo: number };
  delivery: { zoneName: string; etaMinDays: number; etaMaxDays: number };
  payment: { method: string; accountNumber: string; accountName: string; bankName: string };
};

const FORM_KEY = 'vura_checkout_v1';

export function CheckoutPage() {
  const cart = useCart();
  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [issues, setIssues] = useState<CartIssue[]>([]);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState('');
  const [result, setResult] = useState<CheckoutResult | null>(null);

  const [form, setForm] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem(FORM_KEY) || '{}') as Record<string, string>;
    } catch {
      return {} as Record<string, string>;
    }
  });
  const [states, setStates] = useState<NigeriaState[]>([]);
  const [lgas, setLgas] = useState<NigeriaLga[]>([]);
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const lgasForState = useRef('');

  useEffect(() => {
    track('page_view', { page: 'checkout' });
    void cart.revalidate().then((found) => {
      setIssues(found);
      if (found.some((i) => i.type === 'unavailable' || i.type === 'removed')) {
        router.navigate('/cart', { replace: true });
      }
    });
    storefrontApi.locations().then((r) => setStates(r.states)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(FORM_KEY, JSON.stringify(form));
    } catch {
      // storage unavailable
    }
  }, [form]);

  useEffect(() => {
    if (step < 2) return;
    const stateId = states.find((s) => s.code === form.stateCode)?.id;
    if (!stateId) {
      setLgas([]);
      return;
    }
    if (form.stateCode === lgasForState.current) return;
    lgasForState.current = form.stateCode;
    storefrontApi.lgas(stateId).then((r) => setLgas(r.lgas)).catch(() => setLgas([]));
  }, [step, states, form.stateCode]);

  useEffect(() => {
    if (!form.stateCode || step < 3) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    storefrontApi.deliveryQuote(form.stateCode, cart.subtotalKobo)
      .then((r) => !cancelled && setQuote(r.quote))
      .catch(() => !cancelled && setQuote(null));
    return () => {
      cancelled = true;
    };
  }, [form.stateCode, step, cart.subtotalKobo]);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  if (result) {
    return (
      <ConfirmedView
        result={result}
        customerName={form.fullName || user?.name || ''}
        guest={!user}
      />
    );
  }

  if (cart.lines.length === 0) {
    return (
      <main id="main" className="mx-auto max-w-3xl px-4 py-20">
        <EmptyState icon={<ShoppingCart size={26} />} title="Your cart is empty" description="Add something before checking out." action={<Link to="/search"><Button>Browse products</Button></Link>} />
      </main>
    );
  }

  const blocking = issues.filter((i) => i.type === 'unavailable' || i.type === 'removed');
  const totalKobo = cart.subtotalKobo + (quote?.feeKobo ?? 0);

  const validateCustomer = () => {
    if ((form.fullName || '').trim().length < 2) return 'Enter your full name.';
    if (!/^[0-9+\-\s()]{7,20}$/.test((form.phone || '').trim())) return 'Enter a valid phone number.';
    if (form.whatsapp && !/^[0-9+\-\s()]{7,20}$/.test(form.whatsapp.trim())) return 'Enter a valid WhatsApp number or leave it empty.';
    if (!/^\S+@\S+\.\S+$/.test((form.email || '').trim())) return 'Enter a valid email address.';
    return '';
  };

  const validateAddress = () => {
    if (!form.stateCode) return 'Select your state.';
    if (!form.lga) return 'Select your LGA.';
    if ((form.area || '').trim().length < 2) return 'Enter your city or area.';
    if ((form.street || '').trim().length < 5) return 'Enter your street address.';
    return '';
  };

  const placeOrder = async () => {
    setPlacing(true);
    setPlaceError('');
    try {
      const response = await storefrontApi.placeOrder({
        items: cart.lines.map((line) => ({ productId: line.productId, variantId: line.variantId, quantity: line.quantity })),
        name: form.fullName,
        phone: form.phone,
        whatsapp: form.whatsapp || undefined,
        email: form.email,
        address: {
          stateCode: form.stateCode,
          stateName: states.find((s) => s.code === form.stateCode)?.name,
          lga: form.lga,
          city: form.city || form.area,
          area: form.area,
          street: form.street,
          landmark: form.landmark || undefined,
          instructions: form.instructions || undefined,
        },
      });
      track('order_completed', { orders: response.orders.length, totalKobo: response.totals.totalKobo });
      track('checkout_completed', { orders: response.orders.map((o) => o.order_number).join(',') });
      cart.clear();
      setResult(response);
    } catch (error) {
      track('payment_failed', {});
      setPlaceError((error as Error).message || 'We could not place your order. Please try again.');
    } finally {
      setPlacing(false);
    }
  };

  return (
    <main id="main" className="mx-auto max-w-5xl px-4 py-10 md:px-6">
      <button onClick={() => (step === 1 ? router.navigate('/cart') : setStep((s) => (s - 1) as Step))} className="mb-6 inline-flex items-center gap-1.5 text-sm font-bold text-low transition hover:text-hi">
        <ChevronLeft size={16} /> Back
      </button>
      <h1 className="font-display text-3xl font-black tracking-tight text-hi sm:text-4xl">Checkout</h1>

      <ol className="mt-8 flex items-center gap-0" aria-label="Checkout progress">
        {STEP_LABELS.map((label, i) => {
          const num = (i + 1) as Step;
          const done = step > num;
          const active = step === num;
          return (
            <li key={label} className={`flex flex-1 items-center ${i < STEP_LABELS.length - 1 ? '' : 'flex-none'}`} aria-current={active ? 'step' : undefined}>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${done ? 'bg-emerald-400 text-black' : active ? 'bg-vura-500 text-white shadow-lg shadow-vura-500/30' : 'border border-white/15 text-low'}`}>
                {done ? <Check size={14} aria-hidden /> : num}
              </span>
              <span className={`ml-2 hidden text-xs font-bold sm:block ${active ? 'text-hi' : 'text-low'}`}>{label}</span>
              {i < STEP_LABELS.length - 1 && <span className={`mx-3 h-px flex-1 ${done ? 'bg-emerald-400/60' : 'bg-white/10'}`} aria-hidden />}
            </li>
          );
        })}
      </ol>

      {blocking.length > 0 && (
        <div role="alert" className="mt-6 rounded-xl border border-red-400/25 bg-red-500/[0.06] p-4 text-sm text-red-200">
          Some items sold out and were removed: {blocking.map((b) => b.name).join(', ')}. Please review your cart.
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <section>
          {step === 1 && (
            <div className="space-y-5 rounded-2xl border border-white/8 bg-surface/60 p-6" aria-label="Customer details">
              <h2 className="font-display text-lg font-bold text-hi">Your details</h2>
              <Field label="Full name" required error={undefined}>
                <Input id="fullName" value={form.fullName || ''} onChange={set('fullName')} autoComplete="name" placeholder="Chinedu Okafor" />
              </Field>
              <Field label="Phone number" required hint="We call this number for delivery coordination.">
                <Input id="phone" type="tel" inputMode="tel" value={form.phone || ''} onChange={set('phone')} autoComplete="tel" placeholder="0803 000 0000" />
              </Field>
              <Field label="WhatsApp number" hint="Optional — for faster updates about your order.">
                <Input id="whatsapp" type="tel" inputMode="tel" value={form.whatsapp || ''} onChange={set('whatsapp')} placeholder="Same as phone" />
              </Field>
              <Field label="Email" required hint="Order confirmation and receipts go here.">
                <Input id="email" type="email" value={form.email || ''} onChange={set('email')} autoComplete="email" placeholder="you@example.com" />
              </Field>
              {!user && <p className="text-xs leading-5 text-low">Checking out as a guest. After ordering you can claim your Vura account from the email we send you.</p>}
              <Button size="lg" className="w-full sm:w-auto" onClick={() => {
                const err = validateCustomer();
                if (err) {
                  setPlaceError(err);
                  return;
                }
                setPlaceError('');
                setStep(2);
              }}>Continue to delivery</Button>
              {placeError && <p role="alert" className="text-sm font-semibold text-red-400">{placeError}</p>}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5 rounded-2xl border border-white/8 bg-surface/60 p-6" aria-label="Delivery address">
              <h2 className="font-display text-lg font-bold text-hi">Delivery address</h2>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="State" required>
                  <Select value={form.stateCode || ''} onChange={(e) => setForm((p) => ({ ...p, stateCode: e.target.value, lga: '' }))}>
                    <option value="">Select state…</option>
                    {states.map((s) => <option key={s.id} value={s.code}>{s.name}</option>)}
                  </Select>
                </Field>
                <Field label="LGA" required>
                  <Select value={form.lga || ''} onChange={set('lga')} disabled={!form.stateCode}>
                    <option value="">{form.stateCode ? 'Select LGA…' : 'Choose state first'}</option>
                    {lgas.map((l) => <option key={l.id} value={l.name}>{l.name}</option>)}
                  </Select>
                </Field>
              </div>
              <Field label="City / Area" required>
                <Input value={form.area || ''} onChange={set('area')} placeholder="Ikeja" />
              </Field>
              <Field label="Street address" required>
                <Input value={form.street || ''} onChange={set('street')} autoComplete="street-address" placeholder="12 Allen Avenue" />
              </Field>
              <Field label="Nearest landmark" hint="Helps our courier find you quickly.">
                <Input value={form.landmark || ''} onChange={set('landmark')} placeholder="Opposite Ikeja City Mall" />
              </Field>
              <Field label="Delivery instructions">
                <Textarea value={form.instructions || ''} onChange={set('instructions')} placeholder="Call when you arrive at the gate…" maxLength={300} />
              </Field>
              <Button size="lg" className="w-full sm:w-auto" onClick={() => {
                const err = validateAddress();
                if (err) {
                  setPlaceError(err);
                  return;
                }
                setPlaceError('');
                setStep(3);
              }}>Review order</Button>
              {placeError && <p role="alert" className="text-sm font-semibold text-red-400">{placeError}</p>}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5 rounded-2xl border border-white/8 bg-surface/60 p-6" aria-label="Order review">
              <h2 className="font-display text-lg font-bold text-hi">Review your order</h2>
              <ul className="divide-y divide-white/8">
                {cart.lines.map((line) => (
                  <li key={`${line.productId}::${line.variantId || ''}`} className="flex gap-3 py-3">
                    {line.image ? <img src={optimizedImage(line.image, 96)} alt="" width={48} height={48} className="h-12 w-12 rounded-xl object-cover" loading="lazy" /> : <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/[0.05] text-low"><ShoppingCart size={16} /></span>}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-hi">{line.name}</p>
                      {line.variantLabel && <p className="text-xs text-low">{line.variantLabel}</p>}
                      <p className="text-xs text-mid">Qty {line.quantity} × {money(line.unitPriceKobo)}</p>
                    </div>
                    <b className="text-sm font-bold text-hi">{money(line.unitPriceKobo * line.quantity)}</b>
                  </li>
                ))}
              </ul>
              <div className="rounded-xl bg-white/[0.03] p-4 text-sm leading-6 text-mid">
                <p><b className="text-hi">{form.fullName}</b> · {form.phone}{form.whatsapp ? ` · WhatsApp ${form.whatsapp}` : ''}</p>
                <p>{form.street}, {form.area}, {form.lga}, {states.find((s) => s.code === form.stateCode)?.name}</p>
                {form.landmark && <p>Landmark: {form.landmark}</p>}
                {form.instructions && <p>Instructions: {form.instructions}</p>}
                <button onClick={() => setStep(2)} className="mt-1 text-xs font-bold text-vura-300 hover:text-vura-200">Edit address</button>
              </div>
              {quote && (
                <p className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.05] p-4 text-sm text-emerald-200" role="status">
                  Delivery to <b>{quote.zoneName}</b>: {money(quote.feeKobo)} · estimated arrival in {quote.etaMinDays}–{quote.etaMaxDays} days.
                </p>
              )}
              {!quote && form.stateCode && <p className="text-xs text-low">Calculating delivery for your state…</p>}
              <Button size="lg" className="w-full sm:w-auto" disabled={!quote} onClick={() => setStep(4)}>Continue to payment</Button>
            </div>
          )}

          {step === 4 && (
            <PaymentPanel
              totalKobo={totalKobo}
              placing={placing}
              placeError={placeError}
              onBack={() => setStep(3)}
              onPay={placeOrder}
            />
          )}
        </section>

        <aside aria-label="Order summary">
          <div className="sticky top-24 rounded-2xl border border-white/8 bg-surface/70 p-6">
            <h2 className="mb-4 font-display text-base font-bold text-hi">Order summary</h2>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between"><dt className="text-mid">Subtotal</dt><dd className="font-bold text-hi">{money(cart.subtotalKobo)}</dd></div>
              <div className="flex justify-between"><dt className="text-mid">Delivery</dt><dd className="font-semibold text-hi">{quote ? money(quote.feeKobo) : '—'}</dd></div>
              <div className="flex justify-between border-t border-white/10 pt-3"><dt className="font-bold text-hi">Total</dt><dd className="font-display text-xl font-bold text-vura-300">{money(totalKobo)}</dd></div>
            </dl>
            <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-low">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden />
              Prices, stock and delivery fees are confirmed by our server at the moment you pay.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

function PaymentPanel({ totalKobo, placing, placeError, onBack, onPay }: { totalKobo: number; placing: boolean; placeError: string; onBack: () => void; onPay: () => void }) {
  const [payment, setPayment] = useState<{ method: string; accountNumber: string; accountName: string; bankName: string } | null>(null);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    storefrontApi.paymentInfo().then((info) => setPayment({
      method: info.paymentMethod,
      accountNumber: info.accountNumber,
      accountName: info.accountName,
      bankName: info.bankName,
    })).catch(() => setPayment(null));
  }, []);

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value).catch(() => undefined);
    setCopied(label);
    setTimeout(() => setCopied(''), 1500);
  };

  return (
    <div className="space-y-5 rounded-2xl border border-white/8 bg-surface/60 p-6" aria-label="Payment">
      <h2 className="font-display text-lg font-bold text-hi">Payment</h2>
      {payment ? (
        <>
          {payment.method === 'bank_transfer' ? (
            <>
              <p className="text-sm leading-6 text-mid">
                Transfer <b className="text-hi">{money(totalKobo)}</b> to the Vura account below. Your order is confirmed the moment our team verifies the transfer.
              </p>
              <div className="space-y-2 rounded-xl border border-vura-500/25 bg-vura-500/[0.07] p-4">
                {[['Bank', payment.bankName], ['Account name', payment.accountName], ['Account number', payment.accountNumber], ['Amount', money(totalKobo)]].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-low">{label}</span>
                    <span className="flex items-center gap-2 text-right font-bold text-hi">
                      {value}
                      {(label === 'Account number' || label === 'Amount') && (
                        <button onClick={() => copy(String(value), label)} aria-label={`Copy ${label}`} className="rounded-md p-1 text-low hover:bg-white/10 hover:text-hi">
                          <Copy size={13} />
                        </button>
                      )}
                      {copied === label && <span className="text-xs font-bold text-emerald-400">Copied</span>}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs leading-5 text-low">You will enter your transfer reference after placing the order — keep your bank receipt handy.</p>
            </>
          ) : (
            <p className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-mid">The payment method “{payment.method}” will be available soon.</p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button variant="ghost" onClick={onBack}>Back</Button>
            <Button size="lg" loading={placing} onClick={onPay}><Lock size={15} aria-hidden /> Place Order · {money(totalKobo)}</Button>
          </div>
          {placeError && <ErrorState title="Order failed" description={placeError} onRetry={() => window.location.reload()} />}
        </>
      ) : (
        <p className="text-sm text-low">Loading secure payment details…</p>
      )}
    </div>
  );
}

function ConfirmedView({ result, customerName, guest }: { result: CheckoutResult; customerName: string; guest: boolean }) {
  const [reference, setReference] = useState('');
  const [submitted, setSubmitted] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const etaFrom = new Date();
  etaFrom.setDate(etaFrom.getDate() + result.delivery.etaMinDays);
  const etaTo = new Date();
  etaTo.setDate(etaTo.getDate() + result.delivery.etaMaxDays);

  const submitReference = async () => {
    if (reference.trim().length < 3) {
      setError('Enter the reference from your bank receipt.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      for (const order of result.orders) {
        await storefrontApi.submitPayment(order.id, reference.trim());
      }
      setSubmitted(result.orders.length);
      track('checkout_completed', { referenceSubmitted: true });
    } catch (e) {
      setError((e as Error).message || 'Could not submit that reference.');
    } finally {
      setSubmitting(false);
    }
  };

  const fmt = (d: Date) => d.toLocaleDateString('en-NG', { day: 'numeric', month: 'long' });

  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-16 md:px-6">
      <div className="rounded-3xl border border-emerald-400/25 bg-emerald-400/[0.05] p-8 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-400/15 text-emerald-300"><Check size={32} /></span>
        <h1 className="mt-5 font-display text-3xl font-black tracking-tight text-hi">Order confirmed{customerName ? `, ${customerName.split(' ')[0]}` : ''}</h1>
        {result.orders.map((order) => (
          <p key={order.id} className="mt-1 font-mono text-sm font-bold text-vura-300">{order.order_number}</p>
        ))}
        <p className="mt-4 text-sm leading-6 text-mid">
          Thank you. Estimated delivery: <b className="text-hi">{fmt(etaFrom)} – {fmt(etaTo)}</b> via {result.delivery.zoneName}.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to={`/track?orderId=${result.orders[0].id}`}><Button>Track Order</Button></Link>
          <Link to="/search"><Button variant="secondary">Continue Shopping</Button></Link>
        </div>
      </div>

      <section className="mt-8 rounded-2xl border border-white/8 bg-surface/60 p-6" aria-label="Complete payment">
        <h2 className="font-display text-lg font-bold text-hi">Complete your bank transfer</h2>
        {submitted >= result.orders.length ? (
          <p className="mt-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.05] p-4 text-sm text-emerald-200">
            Transfer reference submitted for all {submitted} order{submitted === 1 ? '' : 's'}. We'll verify and start sourcing right away. Track progress any time.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm leading-6 text-mid">
              Send <b className="text-hi">{money(result.totals.totalKobo)}</b> to <b className="text-hi">{result.payment.accountName}</b>, <b className="text-hi">{result.payment.bankName}</b> · {result.payment.accountNumber}.
            </p>
            <p className="mt-2 text-sm leading-6 text-mid">
              After paying, enter the <b className="text-hi">bank transfer reference</b> from your receipt (not the order number).
            </p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <label htmlFor="transfer-ref" className="sr-only">Transfer reference</label>
              <Input id="transfer-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. from your bank app / SMS" />
              <Button loading={submitting} onClick={submitReference}>Submit reference</Button>
            </div>
            {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-400">{error}</p>}
            <a
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-300 transition hover:bg-emerald-500/20 sm:w-auto"
              href={`https://wa.me/2347042089496?text=${encodeURIComponent(
                `Hi Vura Market, I have paid for order ${result.orders.map((o) => o.order_number).join(', ')} — total ${money(result.totals.totalKobo)}. Here is my transfer reference: `,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Or send receipt on WhatsApp
            </a>
            <p className="mt-2 text-xs leading-5 text-low">
              WhatsApp is the fastest way if you prefer to share a screenshot of your bank receipt.
            </p>
          </>
        )}
      </section>

      {guest && (
        <p className="mt-6 rounded-2xl border border-vura-500/25 bg-vura-500/[0.06] p-5 text-center text-sm leading-6 text-mid">
          Optional: create a Vura account to track orders later — check your inbox for a claim link, or{' '}
          <Link to="/signup" className="font-bold text-vura-300 hover:text-vura-200">sign up</Link>. You can still submit payment without signing in.
        </p>
      )}
    </main>
  );
}
