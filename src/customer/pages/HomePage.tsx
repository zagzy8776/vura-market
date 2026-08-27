import { useEffect, useMemo, useState } from 'react';
import {
  Baby,
  Car,
  Dumbbell,
  Headphones,
  Home as HomeIcon,
  PackageSearch,
  ShieldCheck,
  Shirt,
  ShoppingBasket,
  Sparkles,
  Star,
  Truck,
} from 'lucide-react';
import { Link } from '../router';
import { storefrontApi } from '../lib/api';
import type { CategoryPublic, StorefrontProduct } from '@/types';
import { ProductCard } from '../components/ProductCard';
import { Button, ErrorState, ProductCardSkeleton } from '../components/ui';
import { getRecentProductIds, track } from '../lib/analytics';
import { money } from '@/lib/money';
import { discountPercent } from '../lib/availability';
import { optimizedImage } from '../lib/images';
import { productPath } from '../lib/productPath';

const CATEGORY_ICONS: Record<string, typeof Headphones> = {
  electronics: Headphones,
  fashion: Shirt,
  'home-living': HomeIcon,
  home: HomeIcon,
  'beauty-health': Sparkles,
  beauty: Sparkles,
  'sports-outdoors': Dumbbell,
  sports: Dumbbell,
  groceries: ShoppingBasket,
  'baby-kids': Baby,
  baby: Baby,
  automotive: Car,
};

const FALLBACK_CATEGORIES = [
  { name: 'Electronics', slug: 'electronics', icon: Headphones },
  { name: 'Fashion', slug: 'fashion', icon: Shirt },
  { name: 'Home & Living', slug: 'home-living', icon: HomeIcon },
  { name: 'Beauty & Health', slug: 'beauty-health', icon: Sparkles },
  { name: 'Sports & Outdoors', slug: 'sports-outdoors', icon: Dumbbell },
  { name: 'Groceries', slug: 'groceries', icon: ShoppingBasket },
  { name: 'Baby & Kids', slug: 'baby-kids', icon: Baby },
  { name: 'Automotive', slug: 'automotive', icon: Car },
];

export function HomePage({ categories }: { categories: CategoryPublic[] }) {
  const [deals, setDeals] = useState<StorefrontProduct[] | null>(null);
  const [recommended, setRecommended] = useState<StorefrontProduct[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    track('page_view', { page: 'home' });
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      storefrontApi.products({ deals: true, perPage: 6 }),
      storefrontApi.products({ ids: getRecentProductIds().slice(0, 6), perPage: 6 }),
      storefrontApi.products({ sort: 'popular', perPage: 6 }),
    ])
      .then(([d, rec, popular]) => {
        if (cancelled) return;
        setDeals(d.products);
        setRecommended(rec.products.length ? rec.products : popular.products);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const categoryCards = useMemo(() => {
    if (categories.length) {
      return categories.slice(0, 8).map((c) => ({
        name: c.name,
        slug: c.slug,
        icon: CATEGORY_ICONS[c.slug] || CATEGORY_ICONS[c.slug.split('-')[0]] || PackageSearch,
      }));
    }
    return FALLBACK_CATEGORIES;
  }, [categories]);

  if (failed && !deals) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16">
        <ErrorState onRetry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <main id="main" className="bg-[#f7f7fb]">
      <section className="relative overflow-hidden bg-gradient-to-br from-[#f3f1ff] via-white to-[#f7f7fb]">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-12 md:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
          <div>
            <h1 className="font-display text-4xl font-bold leading-[1.08] tracking-[-0.03em] text-[#151527] sm:text-5xl lg:text-[3.25rem]">
              Everything you need,{' '}
              <span className="text-vura-500">delivered to your door</span>
            </h1>
            <p className="mt-4 max-w-lg text-base leading-7 text-[#5f6678] sm:text-lg">
              Shop products we source for you — clear prices and delivery across Nigeria.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/search">
                <Button size="lg">Shop Now</Button>
              </Link>
              <Link to="/deals">
                <Button size="lg" variant="secondary">
                  Explore Deals
                </Button>
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-[#5f6678]">
              <span className="flex items-center gap-2">
                <Truck size={16} className="text-vura-500" aria-hidden />
                Fast Delivery Across Nigeria
              </span>
              <span className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-vura-500" aria-hidden />
                Secure Payment 100% Protected
              </span>
              <span className="flex items-center gap-2">
                <PackageSearch size={16} className="text-vura-500" aria-hidden />
                Easy Returns · 3-day Returns
              </span>
            </div>
          </div>

          <div className="relative hidden lg:block">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-vura-50 to-white p-6 shadow-xl shadow-vura-500/10">
              <div className="flex items-center justify-center">
                <div className="relative">
                  <div className="absolute -right-4 -top-4 h-64 w-64 rounded-full bg-vura-200/40 blur-3xl" aria-hidden />
                  <div className="relative flex items-end gap-4">
                    <div className="rounded-2xl bg-vura-500 p-5 text-white shadow-2xl shadow-vura-500/30">
                      <ShoppingBasket size={36} className="mb-2 opacity-90" />
                      <p className="font-display text-lg font-bold leading-tight">VURA</p>
                      <p className="text-xs font-semibold opacity-80">MARKET</p>
                    </div>
                    <div className="space-y-3">
                      {(deals || []).slice(0, 2).map((p) => (
                        <Link
                          key={p.id}
                          to={productPath(p)}
                          className="flex w-48 items-center gap-3 rounded-2xl border border-[#e8e7f1] bg-white p-3 shadow-md transition hover:-translate-y-0.5"
                        >
                          <div className="h-12 w-12 overflow-hidden rounded-lg bg-[#f3f1ff]">
                            {p.images?.[0] ? (
                              <img src={optimizedImage(p.images[0], 96)} alt="" className="h-full w-full object-contain" />
                            ) : (
                              <span className="grid h-full place-items-center text-[#8b93a5]">
                                <PackageSearch size={18} />
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold text-[#151527]">{p.name}</p>
                            <p className="text-xs font-bold text-vura-500">{money(Number(p.price_kobo))}</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="font-display text-xl font-bold text-[#151527] sm:text-2xl">Shop by Category</h2>
          <Link to="/search" className="text-sm font-bold text-vura-500 hover:text-vura-600">
            View all
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-4 md:grid-cols-8">
          {categoryCards.map((c) => {
            const Icon = c.icon;
            return (
              <Link
                key={c.slug}
                to={`/c/${c.slug}`}
                className="group flex flex-col items-center gap-2 rounded-2xl p-3 text-center transition hover:-translate-y-0.5"
              >
                <span className="grid h-14 w-14 place-items-center rounded-full bg-[#f3f1ff] text-vura-500 transition group-hover:bg-vura-500 group-hover:text-white sm:h-16 sm:w-16">
                  <Icon size={24} aria-hidden />
                </span>
                <span className="text-[11px] font-bold leading-tight text-[#151527] sm:text-xs">{c.name}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="font-display text-xl font-bold text-[#151527] sm:text-2xl">Today's Best Deals</h2>
          <Link to="/deals" className="text-sm font-bold text-vura-500 hover:text-vura-600">
            View all deals
          </Link>
        </div>
        <DealShelf products={deals} />
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 md:px-6">
        <div className="mb-2 flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-[#151527] sm:text-2xl">Recommended for You</h2>
            <p className="mt-1 text-sm text-[#8b93a5]">Based on your recent activity</p>
          </div>
          <Link to="/search?sort=popular" className="text-sm font-bold text-vura-500 hover:text-vura-600">
            View all
          </Link>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6">
          {!recommended
            ? Array.from({ length: 6 }, (_, i) => <ProductCardSkeleton key={i} />)
            : recommended.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 2} />)}
        </div>
      </section>
    </main>
  );
}

function DealShelf({ products }: { products: StorefrontProduct[] | null }) {
  if (!products) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (!products.length) {
    return (
      <p className="rounded-2xl border border-dashed border-[#e8e7f1] bg-white py-12 text-center text-sm text-[#8b93a5]">
        No active deals right now — check back soon.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
      {products.map((p, i) => (
        <DealCard key={p.id} product={p} priority={i < 2} />
      ))}
    </div>
  );
}

function DealCard({ product, priority }: { product: StorefrontProduct; priority?: boolean }) {
  const discount = discountPercent(
    Number(product.price_kobo),
    product.compare_at_price_kobo ? Number(product.compare_at_price_kobo) : null,
  );
  const image = product.images?.[0] ? optimizedImage(product.images[0], 400) : '';

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-[#e8e7f1] bg-white transition hover:border-vura-300 hover:shadow-lg hover:shadow-vura-500/10">
      <Link to={productPath(product)} className="relative block aspect-square bg-[#fafafa]">
        {image ? (
          <img
            src={image}
            alt={product.name}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            className="h-full w-full object-contain p-3 transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="grid h-full place-items-center text-[#c5c9d4]">
            <PackageSearch size={36} />
          </span>
        )}
        {discount != null && (
          <span className="absolute left-2 top-2 rounded-md bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
            -{discount}%
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <Link
          to={productPath(product)}
          className="line-clamp-2 min-h-[36px] text-xs font-bold leading-snug text-[#151527] hover:text-vura-500"
        >
          {product.name}
        </Link>
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="font-display text-sm font-bold text-[#151527]">{money(Number(product.price_kobo))}</span>
          {product.compare_at_price_kobo && (
            <s className="text-[11px] font-medium text-[#8b93a5]">{money(Number(product.compare_at_price_kobo))}</s>
          )}
        </div>
        {typeof product.rating === 'number' && product.rating > 0 && (
          <span className="flex items-center gap-1 text-[11px] font-bold text-amber-500">
            <Star size={12} fill="currentColor" aria-hidden />
            {product.rating.toFixed(1)}
            {typeof product.review_count === 'number' && (
              <span className="font-medium text-[#8b93a5]">({product.review_count})</span>
            )}
          </span>
        )}
        <Link to={productPath(product)} className="mt-auto pt-1">
          <button
            type="button"
            className="flex h-9 w-full items-center justify-center rounded-xl border border-vura-500 text-xs font-bold text-vura-500 transition hover:bg-vura-500 hover:text-white"
          >
            Add to Cart
          </button>
        </Link>
      </div>
    </article>
  );
}
