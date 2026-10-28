import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, MapPin, MessageCircle, PackageSearch, Search, ShoppingBag, Store } from 'lucide-react';
import { money } from '@/lib/money';
import { Link } from '../router';
import { sellerApi, type SellerListing } from '../lib/sellerApi';
import type { NigeriaState } from '@/types';

function ProductCard({ item }: { item: SellerListing }) {
  return <Link to={'/listing/' + item.id} className="group overflow-hidden rounded-2xl border border-[#e8e8f0] bg-white transition hover:-translate-y-0.5 hover:shadow-lg">
    <div className="aspect-[4/3] bg-[#f3f2f7]">{item.images?.[0] && <img loading="lazy" alt={item.title} src={item.images[0]} className="h-full w-full object-cover"/>}</div>
    <div className="p-4"><p className="text-[11px] font-bold uppercase tracking-wider text-vura-500">{item.category_name || 'Community'}</p>
      <h2 className="mt-2 line-clamp-2 min-h-10 text-sm font-bold">{item.title}</h2><p className="mt-2 text-lg font-black">{money(item.price_kobo)}</p>
      <p className="mt-2 flex items-center gap-1 text-xs text-[#818899]"><MapPin size={13}/>{item.city}, {item.state_code}</p>
      <p className="mt-1 truncate text-xs text-[#818899]">{item.shop_name}</p>
    </div>
  </Link>;
}

export function CommunityPage({ sellerId }: { sellerId?: string }) {
  const [items, setItems] = useState<SellerListing[]>([]);
  const [states, setStates] = useState<NigeriaState[]>([]);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [state, setState] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { void sellerApi.states().then(r => setStates(r.states)).catch(() => undefined); }, []);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    sellerApi.browse({ sellerId, q: search, state, page }).then(r => { if(active) {setItems(r.listings); setTotal(r.total);} })
      .catch(e => { if(active)setError((e as Error).message); })
      .finally(() => { if(active)setLoading(false); });
    return () => { active=false; };
  }, [sellerId, search, state, page]);
  const submit = (e: FormEvent) => { e.preventDefault(); setPage(1); setSearch(q.trim()); };
  return <main id="main" className="min-h-[75vh] bg-[#f7f7fb] text-[#17182a]">
    <section className="bg-white px-4 py-10 md:px-6 md:py-14">
      <div className="mx-auto max-w-6xl"><p className="text-xs font-bold uppercase tracking-widest text-vura-500">{sellerId?'Seller storefront':'Vura community marketplace'}</p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-tight sm:text-5xl">{sellerId ? (items[0]?.shop_name || 'Community shop') : 'Discover products around Nigeria.'}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[#727a8a]">Browse real listings from community sellers. Ask questions and confirm availability before you buy.</p>
        <div className="mt-6 flex flex-wrap gap-3"><Link to="/sell/new" className="inline-flex items-center gap-2 rounded-xl bg-vura-500 px-5 py-3 text-sm font-bold text-white"><Store size={16}/> Post a product</Link>
          {sellerId&&<Link to="/marketplace" className="inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-bold">All listings <ArrowRight size={16}/></Link>}</div>
      </div>
    </section>
    <div className="mx-auto max-w-6xl px-4 py-7 md:px-6">
      <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-[#e5e6ed] bg-white p-3 shadow-sm sm:grid-cols-[1fr_190px_auto]">
        <label className="flex items-center gap-2 rounded-xl bg-[#f7f7fb] px-3"><Search size={18} className="text-[#838b9e]"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search products…" aria-label="Search community products" className="w-full bg-transparent py-3 text-sm outline-none"/></label>
        <select value={state} onChange={e=>{setPage(1);setState(e.target.value);}} aria-label="Filter by state" className="rounded-xl border border-[#eeeeF3] bg-white px-3 py-3 text-sm"><option value="">All states</option>{states.map(s=><option key={s.id} value={s.code}>{s.name}</option>)}</select>
        <button type="submit" className="rounded-xl bg-[#17182a] px-5 py-3 text-sm font-bold text-white">Search</button>
      </form>
      <div className="mt-8 flex items-center justify-between gap-2"><h2 className="font-display text-xl font-black">{sellerId?'Products from this seller':'Community listings'}</h2><span className="text-sm text-[#858c9c]">{total} results</span></div>
      {error&&<p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {loading?<p className="mt-8 text-sm text-[#7d8395]">Finding listings…</p>:
        items.length?<div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{items.map(item=><ProductCard key={item.id} item={item}/>)}</div>:
        <div className="mt-5 rounded-2xl border border-dashed border-[#d8d7e7] bg-white py-16 text-center"><PackageSearch size={38} className="mx-auto text-vura-400"/><h3 className="mt-3 text-lg font-bold">Nothing listed here yet</h3><p className="mt-2 text-sm text-[#848b9a]">Try another search or check back as sellers join Vura.</p></div>}
      {total>48&&<div className="mt-7 flex items-center justify-center gap-4"><button className="rounded-xl border border-[#e4e3ed] bg-white px-5 py-3 text-sm font-bold disabled:opacity-40" disabled={page<=1} onClick={()=>{setPage(p=>p-1);window.scrollTo({top:0,behavior:'smooth'});}}>Previous</button><span className="text-sm font-bold">Page {page}</span><button className="rounded-xl border border-[#e4e3ed] bg-white px-5 py-3 text-sm font-bold disabled:opacity-40" disabled={page*48>=total} onClick={()=>{setPage(p=>p+1);window.scrollTo({top:0,behavior:'smooth'});}}>Next</button></div>}
    </div>
  </main>;
}

export function CommunityListingPage({ id }: { id: string }) {
  const [item,setItem] = useState<SellerListing|null>(null);
  const [error,setError] = useState('');
  useEffect(()=>{let live=true;sellerApi.browse({id}).then(r=>{if(live)setItem(r.listings[0]||null);}).catch(e=>{if(live)setError((e as Error).message);});return()=>{live=false;};},[id]);
  const phone=item?.whatsapp?.replace(/\D/g,'');
  const message=item?encodeURIComponent('Hello, I saw your '+item.title+' on Vura Market. Is it still available? '+window.location.href):'';
  return <main id="main" className="min-h-[75vh] bg-[#f7f7fb] px-4 py-8 text-[#17182a] md:px-6">
    <div className="mx-auto max-w-6xl"><Link to="/marketplace" className="inline-flex items-center gap-2 text-sm font-bold text-[#757b8b]"><ArrowLeft size={16}/> Community marketplace</Link>
      {error&&<p role="alert" className="mt-6 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
      {!item&&!error&&<p className="mt-8 text-sm text-[#81899a]">Loading product…</p>}
      {item&&<div className="mt-6 grid gap-7 lg:grid-cols-2">
        <div className="grid grid-cols-2 gap-3">{item.images.map((src,i)=><img key={src} src={src} alt={item.title+' photo '+(i+1)} className={'w-full rounded-2xl bg-white object-cover '+(i===0?'col-span-2 aspect-[4/3]':'aspect-square')}/>)}</div>
        <div className="rounded-3xl border border-[#e7e7ef] bg-white p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-wider text-vura-500">{item.category_name} · {item.condition_label}</p>
          <h1 className="mt-3 font-display text-3xl font-black tracking-tight">{item.title}</h1><p className="mt-4 text-3xl font-black text-vura-500">{money(item.price_kobo)}</p>
          <p className="mt-2 text-sm text-[#818898]">{item.quantity} available</p>
          <div className="mt-6 border-y border-[#ebebf1] py-5"><h2 className="text-sm font-bold">About this item</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#697283]">{item.description}</p></div>
          <div className="mt-5"><p className="text-xs uppercase tracking-widest text-[#9399a8]">Sold by</p>
            <Link to={'/shop/'+item.seller_id} className="mt-2 inline-flex items-center gap-2 font-bold text-vura-500"><Store size={18}/>{item.shop_name}</Link>
            <p className="mt-2 flex items-center gap-2 text-sm text-[#808798]"><MapPin size={16}/>{item.city}, {item.state_code}{item.campus?' · '+item.campus:''}</p></div>
          {import.meta.env.VITE_COMMUNITY_ORDER_REQUESTS_ENABLED === 'true'
            ? <Link to={'/buy/'+item.id} className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-vura-500 px-5 py-4 text-sm font-black text-white"><ShoppingBag size={19}/> Request to buy · Confirm with seller</Link>
            : <div className="mt-7 rounded-xl border border-[#e5e4ee] bg-[#f6f4ff] px-4 py-3 text-center text-xs font-bold text-vura-500">Secure Vura buying is being prepared. Do not pay someone who claims to be Vura.</div>}
          {phone&&<a target="_blank" rel="noopener noreferrer" href={'https://wa.me/'+phone+'?text='+message} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[#ddd8f7] bg-white px-5 py-4 text-sm font-bold text-vura-500"><MessageCircle size={19}/> Chat with seller on WhatsApp</a>}
          <p className="mt-4 text-xs leading-5 text-[#888f9e]">Community sales are arranged directly with sellers, outside Vura checkout. Listing approval is not a product or payment guarantee. Inspect goods and verify the seller before paying.</p>
        </div>
      </div>}
    </div>
  </main>;
}
