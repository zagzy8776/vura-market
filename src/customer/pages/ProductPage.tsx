import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Heart, MapPin, Maximize2, PackageSearch, ShieldCheck, ShoppingCart, Truck } from 'lucide-react';
import { useRouter } from '../router';
import { storefrontApi } from '../lib/api';
import type { DeliveryQuote, StorefrontProduct } from '@/types';
import { ProductCard } from '../components/ProductCard';
import { Accordion, Badge, Breadcrumbs, Button, ErrorState, Price, QuantityStepper, Skeleton } from '../components/ui';
import { optimizedImage } from '../lib/images';
import { money } from '@/lib/money';
import { availabilityFor, etaDateRange, formatDate } from '../lib/availability';
import { effectivePriceKobo, findVariant, groupVariantAttributes, initialSelection, resolveSelection, variantAvailable, variantLabel } from '../lib/variants';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useToast } from '../context/ToastContext';
import { rememberProduct, track } from '../lib/analytics';
import { setPageTitle, setCanonicalPath, setJsonLd, setMeta, setSiteJsonLd } from '../lib/seo';

export function ProductPage({ slug }: { slug: string }) {
  const router = useRouter();
  const [data, setData] = useState<{ product: StorefrontProduct; variants: NonNullable<StorefrontProduct['variants']> } | null>(null);
  const [failed, setFailed] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setData(null);
    setFailed(false);
    setNotFound(false);
    let cancelled = false;
    storefrontApi.product(slug, { countView: true })
      .then((result) => !cancelled && setData({ product: result.product, variants: result.variants || [] }))
      .catch((err) => {
        if (cancelled) return;
        if ((err as Error & { status?: number }).status === 404) setNotFound(true);
        else setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (notFound) {
    return (
      <main id="main" className="mx-auto max-w-3xl px-4 py-20">
        <ErrorState title="Product not found" description="This product may have been removed or renamed." onRetry={() => router.navigate('/search')} />
      </main>
    );
  }
  if (failed) {
    return <main id="main" className="mx-auto max-w-3xl px-4 py-20"><ErrorState onRetry={() => window.location.reload()} /></main>;
  }
  if (!data) return <ProductSkeleton />;

  return <ProductView key={data.product.id} product={data.product} variants={data.variants} />;
}

function ProductSkeleton() {
  return (
    <main id="main" className="mx-auto max-w-7xl px-4 py-8 md:px-6">
      <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-3">
          <Skeleton className="aspect-square w-full rounded-3xl" />
          <div className="flex gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-20" />)}</div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-12 w-48" />
          <div className="flex gap-3 pt-4">
            <Skeleton className="h-13 w-40" />
            <Skeleton className="h-13 flex-1" />
          </div>
        </div>
      </div>
    </main>
  );
}

function ProductView({ product, variants }: { product: StorefrontProduct; variants: NonNullable<StorefrontProduct['variants']> }) {
  const router = useRouter();
  const cart = useCart();
  const wishlist = useWishlist();
  const toast = useToast();

  const [selection, setSelection] = useState<Record<string, string>>(() => initialSelection(variants));
  const [quantity, setQuantity] = useState(1);
  const [imageIdx, setImageIdx] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const selectedVariant = useMemo(() => findVariant(variants, selection), [variants, selection]);
  const priceKobo = Number(effectivePriceKobo({ price_kobo: Number(product.price_kobo) }, selectedVariant));
  const compareAt = product.compare_at_price_kobo ? Number(product.compare_at_price_kobo) : null;
  const available = variants.length ? (selectedVariant ? variantAvailable(selectedVariant) : 0) : null;
  const availability = availabilityFor(product.stock_status, available);
  const maxQty = Math.min(available ?? 10, 10);
  const saved = wishlist.has(product.id);
  const images = product.images?.length ? product.images : [];
  const groups = groupVariantAttributes(variants);

  useEffect(() => {
    setSelection(initialSelection(variants));
    setImageIdx(0);
    setQuantity(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  useEffect(() => {
    rememberProduct(product.id);
    track('product_view', { productId: product.id, name: product.name, priceKobo });
    return () => {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  useEffect(() => {
    if (selectedVariant && variants.length) setImageIdx(0);
  }, [selectedVariant, variants.length]);

      useEffect(() => {
    setSiteJsonLd();
    setPageTitle(product.name);
    setCanonicalPath(`/product/${product.slug}`);
    setMeta('name', 'description', product.description?.slice(0, 155) || `${product.name} by ${product.brand} on Vura.`);
    setMeta('property', 'og:title', `${product.name} — Vura`);
    setMeta('property', 'og:description', product.description?.slice(0, 155) || '');
    if (images[0]) setMeta('property', 'og:image', images[0]);
    setJsonLd('product', {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description: product.description,
      sku: product.variants?.find((v) => v.sku)?.sku || product.id,
      brand: { '@type': 'Brand', name: product.brand },
      image: product.images?.slice(0, 3),
      offers: {
        '@type': 'Offer',
        priceCurrency: 'NGN',
        price: (priceKobo / 100).toFixed(0),
        availability: `https://schema.org/${availability.state === 'out_of_stock' ? 'OutOfStock' : 'InStock'}`,
        url: `${window.location.origin}/product/${product.slug}`,
      },
    });
    return () => {
      setJsonLd('product', null);
      setJsonLd('site', null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id, priceKobo]);

  const addToCart = () => {
    if (!availability.purchasable) {
      toast.push({ kind: 'error', title: 'Unavailable', description: 'This item cannot be purchased right now.' });
      return;
    }
    cart.add({
      productId: product.id,
      variantId: selectedVariant?.id ?? null,
      slug: product.slug,
      name: product.name,
      image: images[0] || null,
      unitPriceKobo: priceKobo,
      compareAtPriceKobo: compareAt,
      quantity,
      maxQuantity: maxQty || 1,
      variantLabel: variants.length ? variantLabel(selectedVariant) : undefined,
    });
    toast.push({ kind: 'success', title: 'Added to cart', description: `${product.name}${variants.length ? ` · ${variantLabel(selectedVariant)}` : ''}` });
  };

  const specs = Object.entries((product.specifications as Record<string, unknown>) || {});

  return (
    <main id="main" className="mx-auto max-w-7xl px-4 py-8 md:px-6">
      <Breadcrumbs items={[
        { label: 'Home', href: '/' },
        ...(product.category_slug ? [{ label: product.category_name || 'Category', href: `/c/${product.category_slug}` }] : []),
        { label: product.name },
      ]} />

      <div className="mt-6 grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <Gallery images={images} name={product.name} imageIdx={imageIdx} setImageIdx={setImageIdx} fullscreen={fullscreen} setFullscreen={setFullscreen} />

        <section aria-label="Purchase options">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-low">{product.brand} · {product.condition_label}</p>
          <h1 className="mt-2 font-display text-3xl font-black leading-tight tracking-[-0.03em] text-hi sm:text-4xl">{product.name}</h1>

          <div className="mt-5">
            <Price priceKobo={priceKobo} compareAtKobo={compareAt} size="lg" />
            <p className="mt-1 text-xs text-low">VAT inclusive · no hidden fees</p>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Badge tone={availability.tone}>{availability.label}</Badge>
            {typeof available === 'number' && availability.purchasable && <span className="text-xs font-semibold text-low">{available} unit{available === 1 ? '' : 's'} ready to ship</span>}
            {!variants.length && product.stock_status.toLowerCase() === 'source_on_demand' && <span className="text-xs text-mid">We source this for you on order.</span>}
          </div>

          {groups.map((group) => (
            <fieldset key={group.key} className="mt-5">
              <legend className="mb-2 text-sm font-bold text-hi">{group.key}</legend>
              <div className="flex flex-wrap gap-2">
                {group.values.map((value) => {
                  const candidate = resolveSelection(variants, { ...selection, [group.key]: value });
                  const variantForValue = findVariant(variants, { ...selection, [group.key]: value }) || findVariant(variants, candidate);
                  const selectable = variantForValue ? variantAvailable(variantForValue) > 0 : false;
                  const active = selection[group.key] === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      disabled={!selectable}
                      aria-pressed={active}
                      onClick={() => {
                        const next = resolveSelection(variants, { ...selection, [group.key]: value });
                        setSelection(next);
                        const v = findVariant(variants, next);
                        if (v && variantAvailable(v) < quantity) setQuantity(Math.max(1, Math.min(variantAvailable(v), 10)));
                        track('variant_selected', { productId: product.id, ...next });
                      }}
                      className={`rounded-xl border px-4 py-2.5 text-sm font-bold transition ${active ? 'border-vura-500 bg-vura-500/15 text-vura-200' : selectable ? 'border-white/12 bg-white/[0.04] text-mid hover:border-vura-400/40 hover:text-hi' : 'cursor-not-allowed border-white/6 bg-white/[0.02] text-low line-through opacity-50'}`}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
              {variants.length > 0 && selectedVariant?.sku && (
                <input type="hidden" value={selectedVariant.sku} />
              )}
            </fieldset>
          ))}

          <div className="mt-6 flex items-center gap-4">
            <QuantityStepper value={Math.min(quantity, Math.max(maxQty, 1))} max={Math.max(maxQty, 1)} onChange={setQuantity} />
            <span className="text-xs text-low">Max {maxQty}</span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_1fr]">
            <Button size="lg" onClick={addToCart} loading={false} disabled={!availability.purchasable}>
              <ShoppingCart size={18} aria-hidden /> Add to Cart
            </Button>
            <Button size="lg" variant="secondary" disabled={!availability.purchasable} onClick={() => { addToCart(); router.navigate('/checkout'); }}>
              Buy Now
            </Button>
          </div>

          <button
            onClick={() => void wishlist.toggle({ id: product.id, name: product.name })}
            className={`mt-4 inline-flex items-center gap-2 text-sm font-bold transition ${saved ? 'text-vura-300' : 'text-low hover:text-hi'}`}
            aria-pressed={saved}
          >
            <Heart size={16} fill={saved ? 'currentColor' : 'none'} aria-hidden /> {saved ? 'Saved to wishlist' : 'Save to wishlist'}
          </button>

          <DeliveryEstimator subtotalKobo={priceKobo * Math.min(quantity, Math.max(maxQty, 1))} />

          <ul className="mt-6 space-y-2 border-t border-white/8 pt-5 text-sm text-mid">
            <li className="flex items-center gap-2.5"><ShieldCheck size={16} className="shrink-0 text-vura-300" aria-hidden /> Verified bank-transfer checkout — your payment is confirmed before sourcing starts.</li>
            <li className="flex items-center gap-2.5"><Truck size={16} className="shrink-0 text-vura-300" aria-hidden /> Nationwide delivery with tracking on every dispatch.</li>
            <li className="flex items-center gap-2.5"><PackageSearch size={16} className="shrink-0 text-vura-300" aria-hidden /> Returns accepted within 3 days of delivery where the item is faulty or not as described.</li>
          </ul>

          <div className="mt-8 space-y-3">
            {product.description && (
              <Accordion title="Description" defaultOpen>
                <p className="whitespace-pre-wrap">{product.description}</p>
              </Accordion>
            )}
            {(specs.length > 0 || product.storage || product.color) && (
              <Accordion title="Specifications">
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  {product.storage && (<><dt className="font-semibold text-low">Storage</dt><dd>{product.storage}</dd></>)}
                  {product.color && (<><dt className="font-semibold text-low">Color</dt><dd>{product.color}</dd></>)}
                  {specs.map(([key, value]) => (
                    <FragmentRow key={key} label={key} value={String(value)} />
                  ))}
                </dl>
              </Accordion>
            )}
            <Accordion title="Delivery information">
              <p>Orders are prepared after payment verification. Lagos deliveries typically arrive in 2–3 days; other states in 4–7 days. Exact cost and estimated dates for your address are shown at checkout and above via the delivery estimator.</p>
            </Accordion>
            <Accordion title="Return policy">
              <p>If your item arrives faulty or not as described, request a return within 3 days of delivery. Approved returns are picked up, inspected and refunded to your bank account within 5 working days of inspection.</p>
            </Accordion>
          </div>
        </section>
      </div>

      <RelatedProducts categorySlug={product.category_slug || undefined} excludeId={product.id} />
    </main>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (<><dt className="font-semibold text-low">{label}</dt><dd className="text-hi">{value}</dd></>);
}

function Gallery({ images, name, imageIdx, setImageIdx, fullscreen, setFullscreen }: {
  images: string[];
  name: string;
  imageIdx: number;
  setImageIdx: (i: number) => void;
  fullscreen: boolean;
  setFullscreen: (open: boolean) => void;
}) {
  const zoomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentImage = images[imageIdx];

  useEffect(() => {
    const child = scrollRef.current?.children[imageIdx] as HTMLElement | undefined;
    child?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  }, [imageIdx]);

  const onZoomMove = (e: React.MouseEvent) => {
    const el = zoomRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.transformOrigin = `${x}% ${y}%`;
  };

  const mainImg = currentImage ? optimizedImage(currentImage, 1000) : '';

  return (
    <section aria-label="Product gallery">
      <div className="relative aspect-square overflow-hidden rounded-3xl border border-white/8 bg-[#10101A]" onMouseMove={onZoomMove}>
        {mainImg ? (
          <img
            ref={zoomRef as React.RefObject<HTMLImageElement>}
            src={mainImg}
            alt={`${name} — image ${imageIdx + 1} of ${images.length}`}
            width={1000}
            height={1000}
            decoding="async"
            fetchPriority="high"
            className="h-full w-full object-contain transition-transform duration-200 hover:scale-[1.75]"
          />
        ) : (
          <span className="grid h-full place-items-center text-low"><PackageSearch size={56} /></span>
        )}
        {images.length > 1 && <>
          <button onClick={() => setImageIdx((imageIdx + images.length - 1) % images.length)} aria-label="Previous image" className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/70 sm:grid"><ChevronLeft size={18} /></button>
          <button onClick={() => setImageIdx((imageIdx + 1) % images.length)} aria-label="Next image" className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/70 sm:grid"><ChevronRight size={18} /></button>
        </>}
        {images.length > 0 && (
          <button onClick={() => setFullscreen(true)} aria-label="Open fullscreen gallery" className="absolute bottom-3 right-3 grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/70">
            <Maximize2 size={16} />
          </button>
        )}
      </div>

      {images.length > 1 && (
        <div ref={scrollRef} className="mt-3 flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-wrap">
          {images.map((src, i) => (
            <button
              key={`${src}-${i}`}
              onClick={() => setImageIdx(i)}
              aria-label={`Show image ${i + 1}`}
              aria-current={i === imageIdx}
              className={`h-18 w-18 shrink-0 snap-start overflow-hidden rounded-xl border-2 transition ${i === imageIdx ? 'border-vura-500' : 'border-transparent opacity-60 hover:opacity-100'}`}
            >
              <img src={optimizedImage(src, 144)} alt="" width={72} height={72} loading="lazy" decoding="async" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {fullscreen && images.length > 0 && (
        <div role="dialog" aria-modal="true" aria-label="Image gallery" className="fixed inset-0 z-[95] flex items-center justify-center bg-black/92 p-4" onClick={() => setFullscreen(false)}>
          <img src={optimizedImage(images[imageIdx], 1400)} alt={`${name} fullscreen`} width={1400} height={1400} className="max-h-[85vh] max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
          {images.length > 1 && <>
            <button onClick={(e) => { e.stopPropagation(); setImageIdx((imageIdx + images.length - 1) % images.length); }} aria-label="Previous image" className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"><ChevronLeft size={22} /></button>
            <button onClick={(e) => { e.stopPropagation(); setImageIdx((imageIdx + 1) % images.length); }} aria-label="Next image" className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"><ChevronRight size={22} /></button>
            <div className="absolute bottom-6 flex gap-2">
              {images.map((_, i) => (
                <button key={i} onClick={(e) => { e.stopPropagation(); setImageIdx(i); }} aria-label={`Image ${i + 1}`} className={`h-2 rounded-full ${i === imageIdx ? 'w-7 bg-vura-400' : 'w-2 bg-white/30'}`} />
              ))}
            </div>
          </>}
          <button onClick={() => setFullscreen(false)} aria-label="Close gallery" className="absolute right-4 top-4 rounded-full bg-white/10 p-3 text-white hover:bg-white/20">✕</button>
        </div>
      )}
    </section>
  );
}

export function DeliveryEstimator({ subtotalKobo }: { subtotalKobo: number }) {
  const [states, setStates] = useState<Array<{ code: string; name: string }>>([]);
  const [stateCode, setStateCode] = useState('');
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    storefrontApi.locations()
      .then((r) => setStates(r.states.map((s) => ({ code: s.code, name: s.name }))))
      .catch(() => undefined);

  }, []);

  useEffect(() => {
    if (!stateCode) {
      setQuote(null);
      return;
    }
    setLoading(true);
    storefrontApi.deliveryQuote(stateCode, subtotalKobo)
      .then((r) => setQuote(r.quote))
      .catch(() => setQuote(null))
      .finally(() => setLoading(false));
  }, [stateCode, subtotalKobo]);

  const eta = quote ? etaDateRange(quote.etaMinDays, quote.etaMaxDays) : null;

  return (
    <div className="mt-6 rounded-2xl border border-white/8 bg-surface/60 p-4">
      <label htmlFor="delivery-state" className="mb-2 flex items-center gap-2 text-sm font-bold text-hi"><MapPin size={15} className="text-vura-300" aria-hidden /> Delivery estimate</label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id="delivery-state"
          value={stateCode}
          onChange={(e) => setStateCode(e.target.value)}
          className="h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 pr-8 text-sm text-hi outline-none focus:border-vura-500 [&>*]:bg-[#151522]"
        >
          <option value="">Select state…</option>
          {states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
        {loading && <span className="text-xs text-low">Checking…</span>}
      </div>
      {quote && !loading && (
        <p className="mt-3 text-sm text-mid" role="status">
          <b className="text-hi">{money(quote.feeKobo)}</b> delivery to {quote.zoneName} · arrives <b className="text-hi">{formatDate(eta!.from)} – {formatDate(eta!.to)}</b>
        </p>
      )}
      {stateCode && !quote && !loading && <p className="mt-3 text-xs font-semibold text-red-400" role="alert">We do not deliver to that state yet.</p>}
      {!stateCode && <p className="mt-2 text-xs text-low">Choose your state to see the exact fee and arrival window before checkout.</p>}
    </div>
  );
}

function RelatedProducts({ categorySlug, excludeId }: { categorySlug?: string; excludeId: string }) {
  const [related, setRelated] = useState<StorefrontProduct[]>([]);
  useEffect(() => {
    let cancelled = false;
    storefrontApi.products({ category: categorySlug, perPage: 8, sort: 'popular' })
      .then((r) => !cancelled && setRelated(r.products.filter((p) => p.id !== excludeId).slice(0, 4)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [categorySlug, excludeId]);

  if (!related.length) return null;
  return (
    <section className="mt-16 border-t border-white/8 pt-10" aria-label="You may also like">
      <h2 className="mb-6 font-display text-2xl font-bold tracking-tight text-hi">You may also like</h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {related.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </section>
  );
}

