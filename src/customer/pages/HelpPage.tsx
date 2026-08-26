import { useEffect, useState } from 'react';
import { ChevronRight, LifeBuoy, MessageCircle } from 'lucide-react';
import { Link, useRouter } from '../router';
import { Accordion, Button } from '../components/ui';
import { telHref, waHref } from '@/lib/phone';

const FAQS = [
  { q: 'How does Vura work?', a: 'Vura is a curated Nigerian marketplace. Every product is checked by our team. You order and pay by secure bank transfer; once your payment is verified we source, package and dispatch your item with tracking.' },
  { q: 'How is delivery priced?', a: 'Delivery depends on your state. Lagos is typically ₥3,500 (2–3 days), Abuja ₥4,500 (3–5 days) and other states ₥5,500 (4–7 days). The exact fee for your address is calculated at checkout — never a guess.' },
  { q: 'When do I pay?', a: 'You place the order first, then transfer the exact total to the Vura account shown at checkout. Enter your transfer reference and our team verifies it before sourcing begins.' },
  { q: 'Can I return an item?', a: 'Yes. If your item arrives faulty or not as described, request a return within 3 days of delivery. Approved returns are inspected and refunded to your bank account within 5 working days of inspection.' },
  { q: 'Do I need an account to order?', a: 'No — guest checkout works with just your email. We then offer a one-click account claim so you can track all orders in one place.' },
];

export function HelpPage() {
  const router = useRouter();
  const [support, setSupport] = useState({ phone: '', whatsapp: '' });
  useEffect(() => {
    void fetch('/api/payment-info')
      .then((r) => r.json())
      .then((d) => setSupport({ phone: d.supportPhone || '', whatsapp: d.supportWhatsapp || d.supportPhone || '' }))
      .catch(() => undefined);
  }, []);
  const wa = waHref(support.whatsapp, 'Hi Vura, I need help with an order.');
  const call = telHref(support.phone || support.whatsapp);
  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-12 md:px-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-vura-300">Customer support</p>
      <h1 className="mt-1 font-display text-4xl font-black tracking-tight text-hi">Need help?</h1>
      <p className="mt-3 max-w-lg text-sm leading-6 text-mid">Real humans, real answers. Reach us on WhatsApp for anything about an order, delivery or a return.</p>

      <div id="contact" className="mt-8 grid gap-3 sm:grid-cols-2">
        <a href={wa || call || 'https://wa.me/'} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.06] p-5 transition hover:border-emerald-400/50">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300"><MessageCircle size={20} /></span>
          <span>
            <b className="block text-sm font-bold text-hi">WhatsApp support</b>
            <span className="text-xs text-mid">Fastest response, Mon–Sat 9am–6pm</span>
          </span>
          <ChevronRight size={17} className="ml-auto shrink-0 text-low" aria-hidden />
        </a>
        <button onClick={() => router.navigate('/track')} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-surface/60 p-5 text-left transition hover:border-vura-400/40">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-vura-500/15 text-vura-300"><LifeBuoy size={20} /></span>
          <span>
            <b className="block text-sm font-bold text-hi">Track my order</b>
            <span className="text-xs text-mid">Live status without asking</span>
          </span>
          <ChevronRight size={17} className="ml-auto shrink-0 text-low" aria-hidden />
        </button>
      </div>

      <section id="delivery" aria-label="Delivery FAQ" className="mt-10 space-y-3">
        <h2 className="font-display text-xl font-bold text-hi">Frequently asked</h2>
        {FAQS.map((faq) => (
          <Accordion key={faq.q} title={faq.q}>
            {faq.a}
          </Accordion>
        ))}
      </section>

      <section id="returns" aria-label="Returns policy" className="mt-10 rounded-2xl border border-white/8 bg-surface/60 p-6">
        <h2 className="font-display text-xl font-bold text-hi">Returns & refunds</h2>
        <ol className="mt-3 list-inside list-decimal space-y-2 text-sm leading-6 text-mid">
          <li>Request a return within 3 days of delivery (from this page or your order email).</li>
          <li>We arrange pickup and inspect the item.</li>
          <li>Approved refunds go to your bank account within 5 working days of inspection.</li>
        </ol>
        <Button variant="secondary" size="sm" className="mt-4" onClick={() => window.open(wa || 'https://wa.me/', '_blank', 'noopener')}>Start a return on WhatsApp</Button>
      </section>
    </main>
  );
}

export function NotFoundPage() {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-24 text-center">
      <p className="font-display text-7xl font-black tracking-tighter text-vura-500/40">404</p>
      <h1 className="mt-4 font-display text-3xl font-black tracking-tight text-hi">This page wandered off</h1>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-mid">The link may be old or mistyped. The catalog, however, is very much alive.</p>
      <div className="mt-7 flex justify-center gap-3">
        <Link to="/"><Button size="lg">Back to home</Button></Link>
        <Link to="/search"><Button size="lg" variant="secondary">Browse products</Button></Link>
      </div>
    </main>
  );
}
