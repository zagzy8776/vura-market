import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, PackageSearch, SlidersHorizontal, X } from 'lucide-react';
import { useRouter } from '../router';
import { storefrontApi, type ProductQuery } from '../lib/api';
import type { CategoryPublic, StorefrontProduct } from '@/types';
import { ProductCard } from '../components/ProductCard';
import { Button, Drawer, EmptyState, ErrorState, Input, Pagination, ProductCardSkeleton, Select } from '../components/ui';
import { money } from '@/lib/money';
import { track } from '../lib/analytics';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'popular', label: 'Popular' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
] as const;

type CatalogMode = 'category' | 'search' | 'deals' | 'new';

export function CatalogPage({ mode, categorySlug, categories }: { mode: CatalogMode; categorySlug?: string; categories: CategoryPublic[] }) {
  const router = useRouter();
  const query = router.query;
  const [products, setProducts] = useState<StorefrontProduct[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [brands, setBrands] = useState<Array<{ brand: string; count: number }> | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const loadToken = useRef(0);

  const q = query.get('q') || '';
  const sort = (query.get('sort') as ProductQuery['sort']) || (mode === 'new' ? 'newest' : 'popular');
  const page = Math.max(1, Number(query.get('page')) || 1);
  const brand = query.get('brand') || '';
  const inStock = query.get('inStock') === '1';
  const minPrice = Number(query.get('minPrice')) || undefined;
  const maxPrice = Number(query.get('maxPrice')) || undefined;
  const activeCategory = mode === 'category' ? categorySlug : query.get('category') || '';

  const category = useMemo(() => categories.find((c) => c.slug === activeCategory) || null, [categories, activeCategory]);

  const title = mode === 'deals' ? 'Deals worth checking.' : mode === 'new' ? 'New arrivals' : mode === 'search' ? q ? `Results for “${q}”` : 'Search products' : category?.name || 'Catalog';
  const eyebrow = mode === 'deals' ? 'Special pricing' : mode === 'new' ? 'Just landed' : mode === 'search' ? 'Search' : 'Category';
  const description = mode === 'deals'
    ? 'Genuine discounts — the previous price is always shown next to the current one.'
    : mode === 'new' ? 'The latest additions to the Vura catalog.' : mode === 'search' ? 'Search by product name, brand, SKU, tag or specification.' : undefined;

  useEffect(() => {
    if (mode === 'search') track('page_view', { page: 'search', q });
    else if (mode === 'category') track('page_view', { page: 'category', category: categorySlug });
  }, [mode, q, categorySlug]);

  const fetchProducts = useCallback((append = false) => {
    const token = ++loadToken.current;
    if (append) setLoadingMore(true);
    else {
      setProducts(null);
      setBrands(null);
    }
    storefrontApi.products({
      q: mode === 'search' ? q : undefined,
      category: activeCategory || undefined,
      deals: mode === 'deals' ? true : undefined,
      sort,
      page,
      perPage: 12,
      brand: brand || undefined,
      inStock: inStock || undefined,
      minPrice,
      maxPrice,
    })
      .then((result) => {
        if (token !== loadToken.current) return;
        setTotal(result.total);
        setPages(result.pages);
        setBrands(result.facets?.brands || []);
        setProducts(result.products);
        setLoadingMore(false);
      })
      .catch(() => {
        if (token !== loadToken.current) return;
        setFailed(true);
        setLoadingMore(false);
      });
  }, [mode, q, activeCategory, sort, page, brand, inStock, minPrice, maxPrice]);

  useEffect(() => {
    fetchProducts(false);
  }, [fetchProducts]);

  const patchQuery = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(query.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
    }
    if (!('page' in patch)) next.delete('page');
    const base = router.path;
    const qs = next.toString();
    window.history.replaceState({}, '', base + (qs ? `?${qs}` : ''));
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const hasFilters = Boolean(brand || inStock || minPrice || maxPrice);

  const filtersPanel = (
    <div className="space-y-6">
      <div>
        <p className="mb-2.5 text-xs font-bold uppercase tracking-[0.14em] text-low">Availability</p>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-mid">
          <input
            type="checkbox"
            checked={inStock}
            onChange={(e) => patchQuery({ inStock: e.target.checked ? '1' : null })}
            className="h-4 w-4 rounded border-white/20 bg-white/10 accent-vura-500"
          />
          In stock only
        </label>
      </div>

      <div>
        <p className="mb-2.5 text-xs font-bold uppercase tracking-[0.14em] text-low">Price range</p>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            patchQuery({
              minPrice: String(fd.get('minPrice') || ''),
              maxPrice: String(fd.get('maxPrice') || ''),
            });
          }}
        >
          <Input name="minPrice" type="number" inputMode="numeric" placeholder="Min ₦" defaultValue={minPrice || ''} aria-label="Minimum price" className="h-10 px-3 py-2" min="0" />
          <span className="text-low">–</span>
          <Input name="maxPrice" type="number" inputMode="numeric" placeholder="Max ₦" defaultValue={maxPrice || ''} aria-label="Maximum price" className="h-10 px-3 py-2" min="0" />
          <Button size="sm" variant="secondary" type="submit">Go</Button>
        </form>
        {(minPrice || maxPrice) && (
          <button onClick={() => patchQuery({ minPrice: null, maxPrice: null })} className="mt-2 text-xs font-bold text-vura-300 hover:text-vura-200">
            Clear price range {minPrice && maxPrice ? `(${money(minPrice * 100)}–${money(maxPrice * 100)})` : ''}
          </button>
        )}
      </div>

      {brands && brands.length > 1 && (
        <div>
          <p className="mb-2.5 text-xs font-bold uppercase tracking-[0.14em] text-low">Brand</p>
          <div className="max-h-64 space-y-0.5 overflow-auto pr-1">
            {brands.map(({ brand: b, count }) => (
              <button
                key={b}
                onClick={() => patchQuery({ brand: brand === b ? null : b })}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${brand === b ? 'bg-vura-500/15 text-vura-200' : 'text-mid hover:bg-white/[0.05]'}`}
                aria-pressed={brand === b}
              >
                <span className="truncate">{b}</span>
                <span className="text-xs text-low">{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={() => patchQuery({ brand: null, inStock: null, minPrice: null, maxPrice: null })}>
          <X size={14} /> Clear all filters
        </Button>
      )}
    </div>
  );

  return (
    <main id="main" className="mx-auto max-w-7xl px-4 py-8 md:px-6">
      <header className="border-b border-white/8 pb-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-vura-300">{eyebrow}</p>
        <h1 className="mt-1 font-display text-3xl font-black tracking-[-0.04em] text-hi sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-xl text-sm leading-6 text-mid">{description}</p>}
        <p className="mt-3 text-sm font-semibold text-low" aria-live="polite">{products ? `${total.toLocaleString()} product${total === 1 ? '' : 's'}` : 'Loading…'}</p>
      </header>

      <div className="mt-6 grid gap-8 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block" aria-label="Product filters">
          <div className="sticky top-24">{filtersPanel}</div>
        </aside>

        <section aria-label="Products" aria-busy={!products}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal size={15} /> Filter{hasFilters ? ' •' : ''}
            </Button>
            <label className="ml-auto flex items-center gap-2 text-sm font-semibold text-mid">
              Sort
              <Select value={sort} onChange={(e) => patchQuery({ sort: e.target.value === 'newest' && mode !== 'new' ? null : e.target.value })} className="!w-auto !py-2.5" aria-label="Sort products">
                {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </Select>
              <ChevronDown size={14} className="-ml-7 hidden" aria-hidden />
            </label>
          </div>

          {failed ? (
            <ErrorState onRetry={() => fetchProducts(false)} />
          ) : !products ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => <ProductCardSkeleton key={i} />)}
            </div>
          ) : products.length === 0 ? (
            <EmptyState
              icon={<PackageSearch size={26} />}
              title={q ? `No results for “${q}”` : 'No products found'}
              description="Try a different spelling, remove some filters, or browse another category."
              action={<Button variant="secondary" onClick={() => { window.history.replaceState({}, '', mode === 'search' ? '/search' : router.path); window.dispatchEvent(new PopStateEvent('popstate')); }}>Reset search</Button>}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                {products.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} />)}
              </div>
              {pages > 1 && page < pages && (
                <div className="mt-10 text-center lg:hidden">
                  <Button
                    variant="secondary"
                    loading={loadingMore}
                    onClick={() => patchQuery({ page: String(page + 1) })}
                  >
                    Load more ({total - page * 12} left)
                  </Button>
                </div>
              )}
              <Pagination page={page} pages={pages} onChange={(next) => patchQuery({ page: next === 1 ? null : String(next) })} />
            </>
          )}
        </section>
      </div>

      <Drawer open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters" side="bottom">
        {filtersPanel}
        <div className="sticky bottom-0 mt-6 border-t border-white/8 bg-elevated pt-4">
          <Button className="w-full" onClick={() => setFiltersOpen(false)}>Show {total.toLocaleString()} products</Button>
        </div>
      </Drawer>
    </main>
  );
}
