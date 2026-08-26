import { useEffect, useRef, useState } from 'react';
import { Search, ShoppingBag, X } from 'lucide-react';
import { storefrontApi } from '../lib/api';
import { money } from '@/lib/money';
import { getRecentSearches, rememberSearch, trackSearch } from '../lib/analytics';
import { optimizedImage } from '../lib/images';
import type { StorefrontProduct } from '@/types';

export function SearchBox({ autoFocus, onNavigate, placeholder = 'Search Vura...' }: { autoFocus?: boolean; onNavigate?: () => void; placeholder?: string }) {
  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState<StorefrontProduct[]>([]);
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [trending, setTrending] = useState<Array<{ query: string }>>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setRecent(getRecentSearches());
    fetch('/api/analytics?resource=trending_searches')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setTrending(d?.trending || []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      storefrontApi.products({ q, perPage: 6 })
        .then((r) => setSuggestions(r.products))
        .catch(() => setSuggestions([]));
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const submitSearch = (query: string) => {
    const q = query.trim();
    if (!q) return;
    rememberSearch(q);
    trackSearch(q);
    setOpen(false);
    onNavigate?.();
    window.history.pushState({}, '', `/search?q=${encodeURIComponent(q)}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  const showPanel = open && (value.trim().length >= 2 ? true : recent.length > 0 || trending.length > 0);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 transition focus-within:border-vura-500">
        <Search size={17} className="shrink-0 text-low" aria-hidden />
        <input
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-label="Search products"
          aria-controls="vura-search-suggestions"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === 'Enter' && submitSearch(value)}
          placeholder={placeholder}
          className="h-11 w-full bg-transparent text-sm text-hi placeholder:text-low outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button aria-label="Clear search" onClick={() => { setValue(''); setOpen(false); }} className="text-low hover:text-hi">
            <X size={15} aria-hidden />
          </button>
        )}
        <button onClick={() => submitSearch(value)} className="my-1.5 hidden h-8 items-center rounded-lg bg-vura-500 px-3 text-xs font-bold text-white transition hover:bg-vura-600 sm:flex">
          Search
        </button>
      </div>

      {showPanel && (
        <div id="vura-search-suggestions" role="listbox" aria-label="Search suggestions" className="absolute inset-x-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-white/10 bg-elevated/98 shadow-2xl shadow-black/50 backdrop-blur-xl">
          {value.trim().length >= 2 ? (
            suggestions.length ? (
              <ul className="divide-y divide-white/5">
                {suggestions.map((product) => (
                  <li key={product.id}>
                    <a
                      href={`/product/${product.slug}`}
                      className="flex items-center gap-3 px-4 py-3 transition hover:bg-white/[0.05]"
                      onClick={(e) => {
                        e.preventDefault();
                        rememberSearch(value.trim());
                        trackSearch(value.trim());
                        setOpen(false);
                        onNavigate?.();
                        window.history.pushState({}, '', `/product/${product.slug}`);
                        window.dispatchEvent(new PopStateEvent('popstate'));
                      }}
                    >
                      {product.images?.[0] ? (
                        <img src={optimizedImage(product.images[0], 96)} alt="" width={44} height={44} className="h-11 w-11 rounded-lg object-cover" loading="lazy" />
                      ) : (
                        <span className="grid h-11 w-11 place-items-center rounded-lg bg-white/[0.06] text-low"><ShoppingBag size={16} /></span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-hi">{product.name}</span>
                        <span className="text-xs text-low">{product.brand}</span>
                      </span>
                      <span className="text-sm font-bold text-vura-300">{money(Number(product.price_kobo))}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-4 text-sm text-mid">No matches for “{value.trim()}”. Try a brand or category name.</p>
            )
          ) : (
            <div className="space-y-3 p-4">
              {recent.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-low">Recent searches</p>
                  <div className="flex flex-wrap gap-1.5">
                    {recent.map((q) => (
                      <button key={q} onClick={() => submitSearch(q)} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-semibold text-mid transition hover:border-vura-400/40 hover:text-hi">
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {trending.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-low">Trending now</p>
                  <div className="flex flex-wrap gap-1.5">
                    {trending.map((t) => (
                      <button key={t.query} onClick={() => submitSearch(t.query)} className="rounded-full border border-vura-500/25 bg-vura-500/10 px-3 py-1.5 text-xs font-semibold text-vura-300 transition hover:bg-vura-500/20">
                        {t.query}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {recent.length === 0 && trending.length === 0 && <p className="text-sm text-low">Start typing to search products, brands and categories.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
