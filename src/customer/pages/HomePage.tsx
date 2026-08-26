import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BadgeCheck, ChevronLeft, ChevronRight, Headset, Mail, PackageSearch, ShieldCheck, Truck } from 'lucide-react';
import { Link } from '../router';
import { storefrontApi } from '../lib/api';
import type { CategoryPublic, StorefrontProduct } from '@/types';
import { ProductCard } from '../components/ProductCard';
import { Button, ErrorState, ProductCardSkeleton, SectionHeading } from '../components/ui';
import { optimizedImage } from '../lib/images';
import { getRecentProductIds, track } from '../lib/analytics';

const heroSlides = [
  {
    eyebrow: 'Welcome to Vura',
    title: 'Everything you need.',
    highlight: 'One Vura.',
    sub: 'Discover trending products, electronics, machinery, accessories and more — sourced for you and delivered across Nigeria.',
    ctaTo: '/search',
    ctaLabel: 'Shop Now',
    secondaryTo: '/c/electronics',
    secondaryLabel: 'Explore Categories',
    art: 'from-vura-700/60 via-[#151032] to-[#0B0B12]',
  },
  {
    eyebrow: 'Deals of the week',
    title: 'Real prices.',
    highlight: 'Zero guesswork.',
    sub: 'Discounted phones, laptops and essentials with the previous price shown in full — what you see is what you pay.',
    ctaTo: '/deals',
    ctaLabel: 'Shop Deals',
    secondaryTo: '/new',
    secondaryLabel: 'New Arrivals',
    art: 'from-fuchsia-800/40 via-[#1B1030] to-[#0B0B12]',
  },
];

export function HomePage({ categories }: { categories: CategoryPublic[] }) {
  const [slide, setSlide] = useState(0);
  const [trending, setTrending] = useState<StorefrontProduct[] | null>(null);
  const [deals, setDeals] = useState<StorefrontProduct[] | null>(null);
  const [arrivals, setArrivals] = useState<StorefrontProduct[] | null>(null);
  const [recommended, setRecommended] = useState<StorefrontProduct[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    track('page_view', { page: 'home' });
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      storefrontApi.products({ sort: 'popular', perPage: 8 }),
      storefrontApi.products({ deals: true, perPage: 8 }),
      storefrontApi.products({ sort: 'newest', perPage: 8 }),
      storefrontApi.products({ ids: getRecentProductIds().slice(0, 4), perPage: 4 }),
    ])
      .then(([t, d, a, rec]) => {
        if (cancelled) return;
        setTrending(t.products);
        setDeals(d.products);
        setArrivals(a.products);
        setRecommended(rec.products.length ? rec.products : t.products.slice(0, 4));
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const activeSlide = heroSlides[slide];
  const categoryCards = useMemo(() => categories.filter((c) => (c.product_count ?? 0) >= 0).slice(0, 14), [categories]);

  if (failed && !trending) {
    return <div className="mx-auto max-w-7xl px-4 py-16"><ErrorState onRetry={() => window.location.reload()} /></div>;
  }

  return (
    <main id="main">
      {/* Hero */}
      <section aria-label="Featured" className={`relative overflow-hidden bg-gradient-to-br ${activeSlide.art}`}>
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-vura-500/25 blur-3xl" aria-hidden />
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 md:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-vura-300">{activeSlide.eyebrow}</p>
            <h1 className="mt-4 font-display text-5xl font-bold leading-[0.98] tracking-[-0.05em] text-hi sm:text-6xl lg:text-7xl">
              {activeSlide.title}<br />
              <span className="bg-gradient-to-r from-vura-300 to-vura-500 bg-clip-text text-transparent">{activeSlide.highlight}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-mid">{activeSlide.sub}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={activeSlide.ctaTo}>
                <Button size="lg">Shop Now <ArrowRight size={17} /></Button>
              </Link>
              <Link to={activeSlide.secondaryTo}>
                <Button size="lg" variant="secondary">{activeSlide.secondaryLabel}</Button>
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-sm font-semibold text-low" role="list">
              <span className="flex items-center gap-2" role="listitem"><Truck size={16} className="text-vura-300" aria-hidden /> Nationwide delivery</span>
              <span className="flex items-center gap-2" role="listitem"><ShieldCheck size={16} className="text-vura-300" aria-hidden /> Verified payments</span>
              <span className="flex items-center gap-2" role="listitem"><BadgeCheck size={16} className="text-vura-300" aria-hidden /> Real stock, real prices</span>
            </div>
          </div>

          <div className="relative hidden min-h-[380px] lg:block">
            {deals?.slice(0, 3).map((p, i) => (
              <Link
                key={p.id}
                to={`/product/${p.slug}`}
                className={`absolute w-64 rounded-3xl border border-white/10 bg-surface/90 p-4 shadow-2xl shadow-black/50 backdrop-blur transition hover:-translate-y-1 ${i === 0 ? 'left-2 top-2 -rotate-3' : i === 1 ? 'right-0 top-16 rotate-2' : 'bottom-0 left-20 rotate-1'}`}
              >
                <div className="aspect-video overflow-hidden rounded-2xl bg-[#10101A]">
                  {p.images?.[0]
                    ? <img src={optimizedImage(p.images[0], 480)} alt="" width={256} height={144} loading="lazy" decoding="async" className="h-full w-full object-contain" />
                    : <span className="grid h-full place-items-center text-low"><PackageSearch size={32} /></span>}
                </div>
                <p className="mt-3 truncate text-sm font-bold text-hi">{p.name}</p>
                <p className="mt-1 flex items-baseline gap-2">
                  <b className="font-display text-lg text-vura-300">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Number(p.price_kobo) / 100)}</b>
                </p>
              </Link>
            ))}
            {deals && deals.length === 0 && (
              <div className="absolute inset-0 grid place-items-center rounded-3xl border border-white/10 bg-white/[0.02] text-center text-sm text-low">
                Featured products appear here as soon as listings go live.
              </div>
            )}
          </div>
        </div>

        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 pb-6 md:px-6">
          <div className="flex gap-1.5" role="tablist" aria-label="Hero slides">
            {heroSlides.map((s, i) => (
              <button key={s.title} role="tab" aria-selected={i === slide} aria-label={`Slide ${i + 1}`} onClick={() => setSlide(i)} className={`h-1.5 rounded-full transition-all ${i === slide ? 'w-8 bg-vura-400' : 'w-3 bg-white/20'}`} />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setSlide((s) => (s + heroSlides.length - 1) % heroSlides.length)} aria-label="Previous slide" className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-mid hover:text-hi"><ChevronLeft size={17} /></button>
            <button onClick={() => setSlide((s) => (s + 1) % heroSlides.length)} aria-label="Next slide" className="grid h-9 w-9 place-items-center rounded-full border border-white/15 text-mid hover:text-hi"><ChevronRight size={17} /></button>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section aria-labelledby="categories-heading" className="mx-auto max-w-7xl px-4 py-14 md:px-6">
        <SectionHeading eyebrow="Shop by category" title="Everything in one place" action={<Link to="/search" className="flex items-center gap-1 text-sm font-bold text-vura-300 hover:text-vura-200">View all <ArrowRight size={15} /></Link>} />
        <h2 id="categories-heading" className="sr-only">Categories</h2>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {(categoryCards.length ? categoryCards : Array.from({ length: 7 }, () => null)).map((c, i) =>
            c ? (
              <Link key={c.id} to={`/c/${c.slug}`} className="group rounded-2xl border border-line bg-surface p-4 text-center transition hover:-translate-y-1 hover:border-vura-400/40">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-vura-500/12 font-display text-base font-bold text-vura-300 transition group-hover:bg-vura-500 group-hover:text-white">{c.name.charAt(0)}</span>
                <p className="mt-2.5 truncate text-xs font-bold text-hi">{c.name}</p>
              </Link>
            ) : (
              <div key={`cat-skel-${i}`} className="rounded-2xl border border-line bg-surface p-4"><span className="mx-auto block h-11 w-11 animate-pulse rounded-xl bg-white/[0.06]" /><span className="mx-auto mt-2.5 block h-3 w-3/4 animate-pulse rounded bg-white/[0.06]" /></div>
            ),
          )}
        </div>
      </section>

      {/* Trending */}
      <section aria-labelledby="trending-heading" className="border-y border-white/6 bg-white/[0.015] py-14">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading eyebrow="Trending products" title="Popular right now" action={<Link to="/search?sort=popular" className="flex items-center gap-1 text-sm font-bold text-vura-300 hover:text-vura-200">View all <ArrowRight size={15} /></Link>} />
          <h2 id="trending-heading" className="sr-only">Trending products</h2>
          <ProductShelf products={trending} skeletonCount={8} />
        </div>
      </section>

      {/* Deals */}
      <section aria-labelledby="deals-heading" className="mx-auto max-w-7xl px-4 py-14 md:px-6">
        <SectionHeading eyebrow="Deals" title="Good prices, no noise." action={<Link to="/deals" className="flex items-center gap-1 text-sm font-bold text-vura-300 hover:text-vura-200">All deals <ArrowRight size={15} /></Link>} />
        <h2 id="deals-heading" className="sr-only">Current deals</h2>
        <ProductShelf products={deals} skeletonCount={4} emptyText="No active deals right now — check back soon." />
      </section>

      {/* New arrivals */}
      <section aria-labelledby="arrivals-heading" className="border-y border-white/6 bg-white/[0.015] py-14">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <SectionHeading eyebrow="New arrivals" title="Fresh on Vura" action={<Link to="/new" className="flex items-center gap-1 text-sm font-bold text-vura-300 hover:text-vura-200">View all <ArrowRight size={15} /></Link>} />
          <h2 id="arrivals-heading" className="sr-only">New arrivals</h2>
          <ProductShelf products={arrivals} skeletonCount={8} emptyText="New products land here first." />
        </div>
      </section>

      {/* Recommended */}
      {recommended && recommended.length > 0 && (
        <section aria-labelledby="rec-heading" className="mx-auto max-w-7xl px-4 py-14 md:px-6">
          <SectionHeading eyebrow="For you" title="Recommended for you" />
          <h2 id="rec-heading" className="sr-only">Recommended</h2>
          <ProductShelf products={recommended} skeletonCount={0} />
        </section>
      )}

      {/* Why Vura */}
      <section aria-labelledby="why-heading" className="border-y border-white/6 bg-gradient-to-br from-[#120D2C] to-[#0B0B12] py-16">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-vura-300">Why Vura</p>
          <h2 id="why-heading" className="mt-2 max-w-xl font-display text-3xl font-bold tracking-tight text-hi">We source. We package. We deliver.</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {[
              { icon: <PackageSearch size={22} />, title: 'Curated sourcing', body: 'Every listing is checked by our team before it goes live — no random drop-shipping.' },
              { icon: <ShieldCheck size={22} />, title: 'Trust-first checkout', body: 'Pay by secure bank transfer with full order tracking from payment to doorstep.' },
              { icon: <Headset size={22} />, title: 'Human support', body: 'Real people on WhatsApp when something needs sorting out.' },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-white/8 bg-surface/70 p-6 backdrop-blur">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-vura-500/15 text-vura-300">{item.icon}</span>
                <h3 className="mt-4 font-display text-lg font-bold text-hi">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-mid">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Delivery / trust */}
      <section aria-labelledby="delivery-heading" className="mx-auto max-w-7xl px-4 py-16 md:px-6">
        <div className="grid items-center gap-8 rounded-3xl border border-vura-500/25 bg-vura-500/[0.06] p-8 md:grid-cols-[auto_1fr_auto] md:p-10">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-vura-500/15 text-vura-300"><Truck size={30} /></span>
          <div>
            <h2 id="delivery-heading" className="font-display text-2xl font-bold text-hi">Delivery across Nigeria</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-mid">
              Lagos deliveries typically arrive in 2–3 days. Other states take 4–7 days. Exact cost and dates are calculated at checkout for your address.
            </p>
          </div>
          <Link to="/help#delivery"><Button variant="secondary">Delivery details</Button></Link>
        </div>
      </section>

      {/* Newsletter */}
      <NewsletterBand />
    </main>
  );
}

function ProductShelf({ products, skeletonCount, emptyText }: { products: StorefrontProduct[] | null; skeletonCount: number; emptyText?: string }) {
  if (!products) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {Array.from({ length: skeletonCount }, (_, i) => <ProductCardSkeleton key={i} />)}
      </div>
    );
  }
  if (!products.length) {
    return <p className="rounded-2xl border border-dashed border-white/10 py-12 text-center text-sm text-low">{emptyText || 'Nothing here yet.'}</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
      {products.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 2} />)}
    </div>
  );
}

function NewsletterBand() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  return (
    <section aria-labelledby="newsletter-heading" className="border-t border-white/6 bg-white/[0.015] py-16">
      <div className="mx-auto max-w-7xl px-4 text-center md:px-6">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-vura-500/15 text-vura-300"><Mail size={26} /></span>
        <h2 id="newsletter-heading" className="mt-5 font-display text-3xl font-bold tracking-tight text-hi">Get the deals before anyone else</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-mid">Flash deals and new arrivals straight to your inbox. No spam, unsubscribe anytime.</p>
        {done ? (
          <p role="status" className="mt-6 text-sm font-bold text-emerald-400">You're on the list. Watch your inbox.</p>
        ) : (
          <form
            className="mx-auto mt-6 flex max-w-md gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!/^\S+@\S+\.\S+$/.test(email.trim())) return;
              track('newsletter_intent', {});
              setDone(true);
            }}
          >
            <label htmlFor="newsletter-email" className="sr-only">Email address</label>
            <input
              id="newsletter-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-12 flex-1 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm text-hi placeholder:text-low outline-none focus:border-vura-500"
            />
            <Button size="lg" type="submit">Join</Button>
          </form>
        )}
      </div>
    </section>
  );
}
