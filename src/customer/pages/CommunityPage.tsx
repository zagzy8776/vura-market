import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, MapPin, MessageCircle, PackageSearch, Search, Store } from 'lucide-react';
import { money } from '@/lib/money';
import type { NigeriaState } from '@/types';
import { Link } from '../router';
import { sellerApi, type SellerListing } from '../lib/sellerApi';

function Card({ item }: { item: SellerListing }) {
  return <Link to={'/listing/' + item.id} className="group overflow-hidden rounded-2xl border border-[#e6e5ef] bg-white transition hover:-translate-y-0.5 hover:shadow-xl">
    <div className="aspect-[4/3] bg-[#f4f3f9]">{item.images?.[0] && <img src={item.images[0]} alt={item.title} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"/>}</div>
    <div className="p-4"><p className="text-[11px] font-bold uppercase tracking-[.08em] text-vura-500">{item.category_name || 'Marketplace'}</p><h2 className="mt-1 line-clamp-2 min-h-10 text-sm font-bold text-[#202237]">{item.title}</h2><p className="mt-2 text-lg font-black text-[#17182a]">{money(item.price_kobo)}</p><p className="mt-2 flex items-center gap-1 text-xs text-[#82899a]"><MapPin size={13}/>{item.city}, {item.state_code}</p><p className="mt-1 truncate text-xs text-[#82899a]">{item.shop_name}</p></div>
  </Link>;
}
export function CommunityPage({ sellerId }: { sellerId?: string }) {
  const [listings, setListings] = useState<SellerListing[]>([]);
  const [states, setStates] = useState<NigeriaState[]>([]);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [state, setState] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => { void sellerApi.locations().then(r => setStates(r.states)).catch(() => undefined); }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    sellerApi.browse({ q: search, state, sellerId })
      .then(r => { if (!cancelled) setListings(r.listings); })
      .catch(e => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sellerId, search, state]);
  const submit = (e: FormEvent) => { e.preventDefault(); setSearch(q.trim()); };
  return <main id="main" className="min-h-[75vh] bg-[#f7f7fb] text-[#17182a]">
    <section className="bg-white px-4 py-10 md:px-6 md:py-14"><div className="mx-auto max-w-6xl"><p className="text-xs font-bold uppercase tracking-[.16em] text-vura-500">{sellerId ? 'Seller storefront' : 'Vura community marketplace'}</p><h1 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-5xl">{sellerId ? (listings[0]?.shop_name || 'Seller shop') : 'Find something great nearby.'}</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[#71798a]">Explore products shared by sellers across Nigeria. Contact sellers directly to confirm availability and arrange a safe exchange.</p><div className="mt-6 flex flex-wrap gap-3"><Link to="/sell/new" className="inline-flex items-center gap-2 rounded-xl bg-vura-500 px-5 py-3 text-sm font-bold text-white"><Store size={17}/> Post your product</Link>{sellerId && <Link to="/marketplace" className="inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-bold">All listings <ArrowRight size={16}/></Link>}</div></div></section>
    <div className="mx-auto max-w-6xl px-4 py-7 md:px-6">
      <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-[#e6e7ed] bg-white p-3 shadow-sm sm:grid-cols-[1fr_190px_auto]">
        <label className="flex items-center gap-2 rounded-xl bg-[#f6f6fa] px-3"><Search size={18} className="text-[#868c9a]"/><input value={q} onChange={e => setQ(e.target.value)} className="w-full bg-transparent py-3 text-sm outline-none" placeholder="Search phones, books, fashion…" aria-label="Search seller products"/></label>
        <select value={state} onChange={e => setState(e.target.value)} aria-label="Filter by state" className="rounded-xl border border-[#eeeef3] bg-white px-3 py-3 text-sm"><option value="">All states</option>{states.map(s => <option value={s.code} key={s.code}>{s.name}</option>)}</select>
        <button type="submit" className="rounded-xl bg-[#17182a] px-5 py-3 text-sm font-bold text-white">Search</button>
      </form>
      <div className="mt-8 flex justify-between gap-3"><h2 className="font-display text-xl font-black">{sellerId ? 'Shop listings' : 'Latest community listings'}</h2><span className="text-sm text-[#81899a]">{listings.length} results</span></div>
      {error && <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {loading ? <p className="mt-10 text-sm text-[#7d8495]">Finding listings…</p> : listings.length ? <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{listings.map(item => <Card key={item.id} item={item}/>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-[#d9d8e7] bg-white py-20 text-center"><PackageSearch size={38} className="mx-auto text-vura-400"/><h3 className="mt-3 text-lg font-bold">No listings found yet</h3><p className="mt-2 text-sm text-[#838a98]">Try another search or check back as more sellers join.</p></div>}
    </div>
  </main>;
}
export function CommunityListingPage({ id }: { id: string }) {
  const [item, setItem] = useState<SellerListing | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { sellerApi.browse({ id }).then(r => setItem(r.listings[0] || null)).catch(e => setError((e as Error).message)); }, [id]);
  const number = item?.whatsapp?.replace(/\D/g, '');
  const message = item ? encodeURIComponent('Hello, I found your ' + item.title + ' on Vura Market. Is it still available? Listing: ' + window.location.href) : '';
  return <main id="main" className="min-h-[75vh] bg-[#f7f7fb] px-4 py-8 text-[#17182a] md:px-6"><div className="mx-auto max-w-6xl"><Link to="/marketplace" className="inline-flex items-center gap-2 text-sm font-bold text-[#747b8a]"><ArrowLeft size={16}/> Community marketplace</Link>{error && <p className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}{!item && !error && <p className="mt-10 text-sm text-[#7a8395]">Loading listing…</p>}{item && <div className="mt-6 grid gap-7 lg:grid-cols-2"><div className="grid grid-cols-2 gap-3">{item.images.map((src, i) => <img src={src} key={src} alt={item.title + ' photo ' + (i + 1)} className={'w-full rounded-2xl bg-white object-cover ' + (i === 0 ? 'col-span-2 aspect-[4/3]' : 'aspect-square')}/>)}</div><div className="rounded-3xl border border-[#e8e7f1] bg-white p-6 sm:p-8"><p className="text-xs font-bold uppercase tracking-wider text-vura-500">{item.category_name} · {item.condition_label}</p><h1 className="mt-3 font-display text-3xl font-black tracking-tight">{item.title}</h1><p className="mt-4 text-3xl font-black text-vura-500">{money(item.price_kobo)}</p><p className="mt-2 text-sm text-[#7d8496]">{item.quantity} available</p><div className="mt-6 border-y border-[#ebeaf1] py-5"><p className="text-sm font-bold">About this product</p><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#657083]">{item.description}</p></div><div className="mt-5"><p className="text-xs uppercase tracking-widest text-[#9298a8]">Sold by</p><Link to={'/shop/' + item.seller_id} className="mt-2 inline-flex items-center gap-2 font-bold text-vura-500"><Store size={18}/>{item.shop_name}</Link><p className="mt-2 flex items-center gap-2 text-sm text-[#7d8595]"><MapPin size={16}/>{item.city}, {item.state_code}{item.campus ? ' · ' + item.campus : ''}</p></div>{number && <a href={'https://wa.me/' + number + '?text=' + message} target="_blank" rel="noopener noreferrer" className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-vura-500 px-5 py-4 text-sm font-bold text-white"><MessageCircle size={20}/> Contact seller on WhatsApp</a>}<p className="mt-4 text-xs leading-5 text-[#8b91a0]">Community sellers arrange transactions directly. Vura has reviewed the listing but has not independently guaranteed the product or payment. Check the product and seller before sending money.</p></div></div>}</div>
  </main>;
}
