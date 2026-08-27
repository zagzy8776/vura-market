import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, ChevronRight,
  CreditCard, ExternalLink, Gamepad2, Headphones, Heart, Laptop,
  LayoutGrid, LogOut, Menu, Package, Search, Settings, ShoppingBag,
  Smartphone, Sparkles, Truck, Watch, X, Zap,
} from 'lucide-react';
import { useAuth, type AppUser } from '@/context/AuthContext';
import { money } from '@/lib/money';
import type { Category, Order, Product, View } from '@/types';
import { apiUrl } from '@/lib/apiBase';

const categoryGroups = [
  { title: 'Tech', items: ['Phones', 'Laptops', 'Tablets', 'Monitors', 'Accessories'] },
  { title: 'Gaming', items: ['PS5', 'PS4', 'Xbox', 'Nintendo', 'Controllers'] },
  { title: 'Lifestyle', items: ['Audio', 'Wearables', 'Fashion', 'Shoes', 'Bags'] },
  { title: 'Home', items: ['TVs', 'Appliances', 'Furniture', 'Kitchen'] },
];

const iconMap: Record<string, typeof Smartphone> = {
  Smartphone, Laptop, Gamepad2, Headphones, Package, Watch,
};

// Map a URL path to a view + optional selected product id.
function pathToView(path: string, products: Product[]) {
  if (path === '/' || path === '') return { view: 'home' as const };
  if (path === '/catalog') return { view: 'catalog' as const };
  if (path === '/deals') return { view: 'deals' as const };
  const productMatch = path.match(/^\/product\/([^/]+)$/);
  if (productMatch) {
    const product = products.find(p => p.id === productMatch[1]) || null;
    return { view: 'product' as const, product };
  }
  return { view: 'home' as const };
}

function viewToPath(view: View, selectedId?: string | null) {
  if (view === 'product' && selectedId) return `/product/${selectedId}`;
  if (view === 'catalog') return '/catalog';
  if (view === 'deals') return '/deals';
  return '/';
}

export default function App() {
  const { user, loading } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [view, setView] = useState<View>('home');
  const [selected, setSelected] = useState<Product | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState('');

  // First-load fetch.
  useEffect(() => {
    fetch(apiUrl('/api/categories')).then(r => r.ok ? r.json() : null).then(data => setCategories(data?.categories || [])).catch(() => undefined);
    fetch(apiUrl('/api/products')).then(r => r.ok ? r.json() : null).then(data => setProducts(data?.products || [])).catch(() => undefined);
  }, []);

  // Sync URL → view on mount and whenever products load (so deep links like
  // /catalog and /product/:id resolve correctly after a refresh). popstate
  // does not fire on initial mount, which is why this is an effect rather than
  // a one-time popstate listener.
  useEffect(() => {
    const result = pathToView(window.location.pathname, products);
    setView(result.view);
    if (result.view === 'product') setSelected(result.product || null);
  }, [products]);

  // Sync URL when view changes (push history). Honor back/forward via popstate.
  const go = (next: View, opts?: { product?: Product | null }) => {
    const product = opts?.product ?? null;
    setView(next); setSelected(product); setMenuOpen(false);
    const nextPath = viewToPath(next, product?.id || null);
    if (window.location.pathname !== nextPath) window.history.pushState({ view: next, productId: product?.id || null }, '', nextPath);
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    const sync = () => {
      const result = pathToView(window.location.pathname, products);
      setView(result.view);
      if (result.view === 'product') setSelected(result.product || null);
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, [products]);

  if (loading) return <Loading />;
  const openProduct = (product: Product) => go('product', { product });

  return <div className="min-h-screen bg-[#f7f8fc] text-[#17182a]">
    <Header user={user} view={view} onView={go} onSearch={setSearch} search={search} onMenu={() => setMenuOpen(v => !v)} categories={categories} />
    {menuOpen && <MobileMenu user={user} onView={go} />}
    {view === 'home' && <HomePage categories={categories} products={products} onView={go} onProduct={openProduct} />}
    {view === 'catalog' && <Catalog products={products} categories={categories} search={search} onSearch={setSearch} onProduct={openProduct} />}
    {view === 'deals' && <Catalog products={products} categories={categories} search={search} onSearch={setSearch} onProduct={openProduct} deals />}
    {view === 'product' && selected && <ProductPage product={selected} user={user} onBack={() => go('catalog')} />}
    <Footer onView={go} />
  </div>;
}

function Loading() {
  return <div className="grid min-h-screen place-items-center bg-white"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-vura-500 text-white"><Zap size={19} fill="currentColor" /></span><span className="text-2xl font-black tracking-[-.07em]">VURA<span className="text-vura-500">.</span></span></div></div>;
}

function Header({ user, view, onView, onSearch, search, onMenu, categories }: { user: AppUser | null; view: View; onView: (v: View) => void; onSearch: (v: string) => void; search: string; onMenu: () => void; categories: Category[] }) {
  const { signOut } = useAuth();
  return <header className="sticky top-0 z-50 border-b border-[#e8eaf1] bg-white/95 backdrop-blur-xl">
    <div className="mx-auto max-w-[1440px] px-5 md:px-8">
      <div className="flex h-[70px] items-center gap-4">
        <button onClick={() => onView('home')} className="flex shrink-0 items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-vura-500 text-white shadow-lg shadow-[#5b35f5]/20"><Zap size={20} fill="currentColor" /></span>
          <span className="text-[23px] font-black tracking-[-.08em]">VURA<span className="text-vura-500">.</span></span>
        </button>
        <div className="hidden min-w-0 flex-1 md:block"><div className="mx-auto max-w-xl"><div className="relative"><Search size={17} className="absolute left-4 top-3.5 text-[#98a0b3]"/><input value={search} onChange={e => onSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && onView('catalog')} placeholder="Search phones, laptops, gaming, accessories..." className="w-full rounded-xl border border-[#e2e5ee] bg-[#fafbfe] py-3 pl-11 pr-12 text-sm outline-none transition focus:border-vura-500 focus:bg-white"/><button onClick={() => onView('catalog')} className="absolute right-1.5 top-1.5 grid h-10 w-10 place-items-center rounded-lg bg-vura-500 text-white"><Search size={16}/></button></div></div></div>
        <nav className="hidden items-center gap-6 text-sm font-semibold text-[#5f6678] lg:flex">
          <button onClick={() => onView('catalog')} className={view === 'catalog' ? 'text-vura-500' : ''}>Products</button>
          <button onClick={() => onView('deals')} className={view === 'deals' ? 'text-vura-500' : ''}>Deals</button>
          <button onClick={() => onView('home')} className="text-[#5f6678]">New arrivals</button>
          {user?.role === 'admin' && (
            <a href="/studio" className="text-vura-500 font-bold">Studio</a>
          )}
        </nav>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          {user?.role === 'admin' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#778095]">Admin</span>
              <button onClick={() => void signOut()} className="grid h-10 w-10 place-items-center rounded-xl text-[#778095] hover:bg-[#f4f5fa]" aria-label="Sign out"><LogOut size={18}/></button>
            </div>
          )}
        </div>
        <button onClick={onMenu} className="ml-auto grid h-10 w-10 place-items-center rounded-xl bg-[#f4f5fa] md:hidden"><Menu size={21}/></button>
      </div>
      <div className="hidden h-11 items-center gap-7 border-t border-[#eff0f5] lg:flex">
        <MegaMenu label="Categories"><div className="grid grid-cols-4 gap-8 p-6"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-[#9aa2b2]">Popular</p><div className="mt-3 space-y-2">{categories.slice(0, 6).map(c => <button key={c.slug} onClick={() => onView('catalog')} className="block text-left text-sm font-semibold text-[#33384a] hover:text-vura-500">{c.name}</button>)}</div></div>{categoryGroups.map(g => <div key={g.title}><p className="text-xs font-bold uppercase tracking-[.15em] text-[#9aa2b2]">{g.title}</p><div className="mt-3 space-y-2">{g.items.slice(0, 5).map(i => <button key={i} onClick={() => onView('catalog')} className="block text-left text-sm font-semibold text-[#33384a] hover:text-vura-500">{i}</button>)}</div></div>)}</div></MegaMenu>
        <button onClick={() => onView('catalog')} className="text-sm font-semibold text-[#687083]">All products</button>
        <button onClick={() => onView('deals')} className="text-sm font-semibold text-[#687083]">Deals</button>
        <button onClick={() => onView('home')} className="text-sm font-semibold text-[#687083]">Gaming</button>
        <button onClick={() => onView('home')} className="text-sm font-semibold text-[#687083]">Phones</button>
        <button onClick={() => onView('home')} className="text-sm font-semibold text-[#687083]">Computers</button>
        <button onClick={() => onView('home')} className="text-sm font-semibold text-[#687083]">Fashion</button>
        <span className="ml-auto text-xs font-semibold text-[#9aa2b2]">Local sourcing · Lagos delivery</span>
      </div>
    </div>
  </header>;
}

function MegaMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <div className="relative h-full flex items-center"><button onClick={() => setOpen(v => !v)} className="flex items-center gap-1.5 text-sm font-bold text-[#32384a]">{label}<ChevronDown size={15}/></button>{open && <div className="absolute left-0 top-11 z-50 w-[820px] border border-[#e7e9f0] bg-white shadow-2xl">{children}</div>}</div>;
}

function MobileMenu({ user, onView }: { user: AppUser | null; onView: (v: View) => void }) {
  return <div className="fixed inset-x-0 top-[70px] z-40 border-b border-[#e6e8ef] bg-white shadow-xl md:hidden"><div className="space-y-1 p-5"><button onClick={() => onView('catalog')} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-semibold"><LayoutGrid size={18}/>All products</button><button onClick={() => onView('deals')} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-semibold"><Sparkles size={18}/>Deals</button><button onClick={() => onView('catalog')} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-semibold"><Smartphone size={18}/>Phones</button><button onClick={() => onView('catalog')} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-semibold"><Gamepad2 size={18}/>Gaming</button>{user?.role === 'admin' && <a href="/studio" className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-semibold text-vura-500"><Settings size={18}/>Studio</a>}</div></div>;
}

function HomePage({ categories, products, onView, onProduct }: { categories: Category[]; products: Product[]; onView: (v: View) => void; onProduct: (p: Product) => void }) {
  const featured = products.slice(0, 5);
  const categoryCards = categories.slice(0, 8);
  return <main>
    <section className="border-b border-[#e8eaf1] bg-white"><div className="mx-auto grid max-w-[1440px] items-stretch lg:grid-cols-[1.02fr_.98fr]"><div className="px-5 py-14 md:px-10 md:py-20 lg:py-24"><div className="max-w-2xl"><p className="text-sm font-bold tracking-[.02em] text-vura-500">WELCOME TO VURA</p><h1 className="mt-4 max-w-xl text-5xl font-black leading-[.98] tracking-[-.07em] text-[#17182a] md:text-7xl">Find it.<br/><span className="text-vura-500">We'll get it</span> to you.</h1><p className="mt-6 max-w-xl text-lg leading-8 text-[#7a8294]">Shop products we source from real local stores, with one clear Vura price and coordinated delivery to your doorstep.</p><div className="mt-8 flex flex-wrap gap-3"><button onClick={() => onView('catalog')} className="rounded-xl bg-vura-500 px-6 py-3.5 font-bold text-white shadow-xl shadow-[#5b35f5]/20">Shop now <ArrowRight className="ml-2 inline" size={17}/></button><button onClick={() => onView('catalog')} className="rounded-xl border border-[#dfe2ea] bg-white px-6 py-3.5 font-bold text-[#3b4151]">Browse categories</button></div></div></div><div className="min-h-[360px] overflow-hidden bg-gradient-to-br from-[#f1edff] via-white to-[#ececf7] p-6 md:p-10"><div className="grid h-full place-items-center"><div className="grid w-full max-w-xl grid-cols-2 gap-5"><div className="rounded-[28px] bg-white p-5 shadow-xl rotate-[-3deg]"><div className="h-52 rounded-2xl bg-[#eef1f8] grid place-items-center"><Smartphone size={92} className="text-[#7b8498]"/></div><div className="mt-4"><p className="text-xs font-bold text-[#8d95a5]">SMARTPHONES</p><p className="mt-1 font-black">Latest devices</p></div></div><div className="rounded-[28px] bg-[#17182a] p-5 text-white shadow-2xl translate-y-8 rotate-[3deg]"><div className="h-52 rounded-2xl bg-[#252743] grid place-items-center"><Laptop size={92} className="text-[#c3c8ff]"/></div><div className="mt-4"><p className="text-xs font-bold text-[#b9bdf6]">COMPUTERS</p><p className="mt-1 font-black">Work & play</p></div></div></div></div></div></div></section>
    <TrustStrip />
    <section className="mx-auto max-w-[1440px] px-5 py-12 md:px-8"><SectionHeading eyebrow="Shop by category" title="Everything in one place" action="View all" onAction={() => onView('catalog')} /><div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">{categoryCards.map(c => { const Icon = iconMap[c.icon] || Package; return <button key={c.slug} onClick={() => onView('catalog')} className="group border border-[#e7e9f0] bg-white p-4 text-center transition hover:-translate-y-1 hover:border-[#cfc7ff] hover:shadow-lg"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f2f0ff] text-vura-500 group-hover:bg-vura-500 group-hover:text-white"><Icon size={22}/></span><p className="mt-3 text-sm font-bold text-[#34394b]">{c.name}</p></button>; })}</div></section>
    <section className="border-y border-[#e8eaf1] bg-white"><div className="mx-auto max-w-[1440px] px-5 py-12 md:px-8"><SectionHeading eyebrow="Featured products" title="Popular right now" action="View all" onAction={() => onView('catalog')} /><div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{featured.length ? featured.map(p => <ProductCard key={p.id} product={p} onClick={() => onProduct(p)} />) : <EmptyShelf />}</div></div></section>
    <section className="mx-auto max-w-[1440px] px-5 py-12 md:px-8"><div className="flex items-end justify-between"><div><p className="text-sm font-bold text-[#ef7b3a]">DEALS</p><h2 className="mt-1 text-3xl font-black tracking-[-.05em]">Good prices, no noise.</h2></div><button onClick={() => onView('deals')} className="hidden text-sm font-bold text-vura-500 sm:flex items-center gap-1">View deals <ArrowRight size={16}/></button></div><div className="mt-7 grid gap-5 md:grid-cols-2"><DealCard title="Gaming weekend" text="Consoles, controllers and accessories." icon={<Gamepad2 size={34}/>} /><DealCard title="Workday upgrade" text="Laptops, monitors and essentials." icon={<Laptop size={34}/>} /></div></section>
    <section className="border-y border-[#e8eaf1] bg-[#17182a] text-white"><div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-5 py-10 md:flex-row md:items-center md:justify-between md:px-8"><div><p className="text-sm font-bold text-[#bfc0ff]">WHY VURA</p><h2 className="mt-1 text-2xl font-black tracking-[-.04em]">We source. We package. We deliver.</h2></div><div className="grid grid-cols-3 gap-4 text-center text-xs text-white/70 md:w-[520px]"><TrustItem icon={<ShoppingBag size={19}/>} label="Quality products" /><TrustItem icon={<CreditCard size={19}/>} label="Clear checkout" /><TrustItem icon={<Truck size={19}/>} label="Local delivery" /></div></div></section>
  </main>;
}

function TrustStrip() { return <div className="border-b border-[#e8eaf1] bg-white"><div className="mx-auto grid max-w-[1440px] grid-cols-2 md:grid-cols-4">{[['Quality products', ShoppingBag], ['Secure bank transfer', CreditCard], ['Fast local delivery', Truck], ['Support when needed', BookOpen]].map(([label, Icon]) => <div key={String(label)} className="flex items-center gap-3 border-r border-[#eef0f5] px-5 py-4 last:border-r-0"><span className="grid h-9 w-9 place-items-center rounded-lg bg-[#f2f0ff] text-vura-500"><Icon size={17}/></span><span className="text-sm font-semibold text-[#5d6577]">{String(label)}</span></div>)}</div></div>; }

function SectionHeading({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action: string; onAction: () => void }) { return <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#8b93a5]">{eyebrow}</p><h2 className="mt-1 text-2xl font-black tracking-[-.04em] md:text-3xl">{title}</h2></div><button onClick={onAction} className="flex shrink-0 items-center gap-1 text-sm font-bold text-vura-500">{action}<ArrowRight size={15}/></button></div>; }

function ProductCard({ product, onClick }: { product: Product; onClick: () => void }) { return <button onClick={onClick} className="group overflow-hidden border border-[#e5e7ef] bg-white text-left transition hover:-translate-y-1 hover:border-[#cec7ff] hover:shadow-xl"><div className="relative bg-[#f2f3f7] p-4"><div className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-[#737b8d] shadow"><Heart size={16}/></div>{product.images?.[0] ? <img src={product.images[0]} alt={product.name} className="h-52 w-full object-contain transition duration-500 group-hover:scale-105"/> : <div className="grid h-52 place-items-center text-[#aab1c0]"><Package size={45}/></div>}</div><div className="p-4"><p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#9aa1b0]">{product.brand}</p><h3 className="mt-1 line-clamp-2 min-h-[44px] text-base font-bold text-[#292d3d]">{product.name}</h3><div className="mt-3 flex items-end justify-between gap-2"><span className="text-lg font-black text-[#17182a]">{money(product.price_kobo)}</span><span className="text-[11px] font-semibold text-[#4e9b6e]">Available</span></div></div></button>; }

function Catalog({ products, categories, search, onSearch, onProduct, deals = false }: { products: Product[]; categories: Category[]; search: string; onSearch: (v: string) => void; onProduct: (p: Product) => void; deals?: boolean }) {
  const [category, setCategory] = useState('All');
  const filtered = useMemo(() => products.filter(p => (category === 'All' || p.category === category || p.category_id === category) && (!search.trim() || `${p.name} ${p.brand} ${p.description}`.toLowerCase().includes(search.toLowerCase()))), [products, search, category]);
  return <main className="mx-auto max-w-[1440px] px-5 py-8 md:px-8"><div className="mb-6 flex items-center gap-2 text-sm text-[#9299aa]"><button className="hover:text-vura-500">Home</button><ChevronRight size={14}/><span>{deals ? 'Deals' : 'Products'}</span></div><div className="flex flex-col gap-4 border-b border-[#e7e9f0] pb-6 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#8f97a9]">{deals ? 'Special pricing' : 'Marketplace'}</p><h1 className="mt-1 text-4xl font-black tracking-[-.055em]">{deals ? 'Deals worth checking.' : 'All products.'}</h1></div><div className="relative w-full md:w-96"><Search size={17} className="absolute left-3.5 top-3.5 text-[#98a0b2]"/><input value={search} onChange={e => onSearch(e.target.value)} placeholder="Search the catalog..." className="w-full border border-[#dfe2ea] bg-white py-3 pl-10 pr-4 text-sm outline-none focus:border-vura-500"/></div></div><div className="mt-6 grid gap-8 lg:grid-cols-[230px_1fr]"><aside className="hidden lg:block"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#939aac]">Categories</p><div className="mt-3 space-y-1">{['All', ...categories.map(c => c.name)].map(c => <button key={c} onClick={() => setCategory(c)} className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-semibold ${category === c ? 'bg-[#f0edff] text-vura-500' : 'text-[#60687a] hover:bg-[#f7f8fb]'}`}><span>{c}</span>{category === c && <Check size={15}/>}</button>)}</div><div className="mt-8 border-t border-[#e8eaf1] pt-6"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#939aac]">Trust</p><div className="mt-3 space-y-3 text-sm text-[#727b8c]"><p className="flex items-center gap-2"><Package size={15} className="text-vura-500"/> In stock</p><p className="flex items-center gap-2"><Truck size={15} className="text-vura-500"/> Delivery available</p></div></div></aside><div><div className="mb-4 flex items-center justify-between"><div className="flex gap-2 overflow-x-auto lg:hidden">{['All', ...categories.slice(0, 6).map(c => c.name)].map(c => <button key={c} onClick={() => setCategory(c)} className={`shrink-0 px-4 py-2.5 text-sm font-bold ${category === c ? 'bg-[#17182a] text-white' : 'bg-[#f0f1f6] text-[#677083]'}`}>{c}</button>)}</div><span className="text-xs font-semibold text-[#9299aa]">{filtered.length} products</span></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{filtered.length ? filtered.map(p => <ProductCard key={p.id} product={p} onClick={() => onProduct(p)} />) : <div className="col-span-full border border-dashed border-[#dfe2e9] py-24 text-center"><Package className="mx-auto text-[#b6bdc9]" size={38}/><h3 className="mt-4 text-xl font-black">Nothing here yet</h3><p className="mt-2 text-sm text-[#8a92a4]">We're preparing fresh Vura listings.</p></div>}</div></div></div></main>;
}

function ProductPage({ product, user, onBack }: { product: Product; user: AppUser | null; onBack: () => void }) {
  const [qty, setQty] = useState(1); const [checkout, setCheckout] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [payment, setPayment] = useState<{ accountNumber: string; accountName: string; bankName: string } | null>(null); const [created, setCreated] = useState<Order | null>(null);
  const [form, setForm] = useState({ email: '', name: '', phone: '', address: '', city: '' });
  const total = product.price_kobo * qty;
  const placeOrder = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await fetch(apiUrl('/api/orders'), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: product.id, quantity: qty, ...form }) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Unable to create order');
      setCreated(data.order); setPayment(data.payment);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to create order'); }
    finally { setBusy(false); }
  };
  return <main className="mx-auto max-w-[1440px] px-5 py-8 md:px-8"><button onClick={onBack} className="mb-8 flex items-center gap-2 text-sm font-bold text-[#6d7587]"><ArrowLeft size={16}/> Back to products</button><div className="grid gap-10 lg:grid-cols-[1.1fr_.9fr]"><div><div className="grid gap-3 md:grid-cols-[96px_1fr]"><div className="order-2 flex gap-2 md:order-1 md:flex-col">{(product.images || []).map((src, i) => <div key={src} className="grid h-20 w-20 place-items-center overflow-hidden border border-[#e2e4eb] bg-[#f4f5f8] md:h-[84px] md:w-[84px]"><img src={src} alt="" className="h-full w-full object-contain"/><span className="sr-only">Image {i + 1}</span></div>)}</div><div className="order-1 min-h-[520px] border border-[#e3e5ec] bg-[#f4f5f8] p-8 md:order-2">{product.images?.[0] ? <img src={product.images[0]} alt={product.name} className="h-full w-full object-contain"/> : <div className="grid h-full place-items-center text-[#b0b7c4]"><Package size={70}/></div>}</div></div></div><div><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-[#939bab]"><span>{product.brand}</span><span>·</span><span>{product.condition_label}</span></div><h1 className="mt-2 text-4xl font-black tracking-[-.055em] md:text-5xl">{product.name}</h1><div className="mt-5 flex items-end justify-between"><div><p className="text-3xl font-black text-[#17182a]">{money(product.price_kobo)}</p><p className="mt-1 text-sm text-[#7c8495]">Clear Vura retail price</p></div><span className="flex items-center gap-1 rounded-full bg-[#eaf8ef] px-3 py-1.5 text-xs font-bold text-[#368357]"><Check size={14}/> Available</span></div><div className="my-7 border-y border-[#e8eaf0] py-6"><p className="text-sm font-bold text-[#3d4354]">Specifications</p><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><Spec label="Brand" value={product.brand}/><Spec label="Condition" value={product.condition_label}/><Spec label="Storage" value={product.storage || '—'}/><Spec label="Color" value={product.color || '—'}/></div></div><p className="text-sm leading-7 text-[#727b8d]">{product.description || 'Vura-sourced product with delivery available in supported locations.'}</p><div className="mt-7 grid gap-3 sm:grid-cols-[150px_1fr]"><div className="flex items-center justify-between border border-[#dfe2ea] px-4 py-3"><button onClick={() => setQty(Math.max(1, qty - 1))}>−</button><span className="font-bold">{qty}</span><button onClick={() => setQty(qty + 1)}>+</button></div><button onClick={() => setCheckout(true)} className="rounded-xl bg-vura-500 px-6 py-3.5 font-bold text-white shadow-lg shadow-[#5b35f5]/20">Buy now</button></div><div className="mt-4 flex items-center gap-5 text-xs font-semibold text-[#778093]"><span className="flex items-center gap-2"><Package size={16} className="text-vura-500"/> In stock</span><span className="flex items-center gap-2"><Truck size={16} className="text-vura-500"/> Delivery available</span></div></div></div>{checkout && !created && <div className="fixed inset-0 z-[60] grid place-items-end bg-black/40 p-0 md:place-items-center md:p-6"><form onSubmit={placeOrder} className="w-full max-w-2xl border border-[#dfe2ea] bg-white shadow-2xl md:max-h-[90vh] md:overflow-auto"><div className="flex items-center justify-between border-b border-[#ebedf2] px-5 py-4"><div><p className="text-xs font-bold uppercase tracking-[.13em] text-[#9299aa]">Checkout</p><h2 className="text-xl font-black">Delivery details</h2></div><button type="button" onClick={() => setCheckout(false)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#f5f6fa]"><X size={18}/></button></div><div className="grid gap-5 p-5 md:grid-cols-[1fr_260px]"><div className="space-y-4"><Field label="Email address"><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required className="w-full border border-[#dfe2ea] px-3 py-3 outline-none focus:border-vura-500" /></Field><Field label="Full name"><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required className="w-full border border-[#dfe2ea] px-3 py-3 outline-none focus:border-vura-500" /></Field><Field label="Phone"><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required className="w-full border border-[#dfe2ea] px-3 py-3 outline-none focus:border-vura-500" /></Field><Field label="Address"><input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} required className="w-full border border-[#dfe2ea] px-3 py-3 outline-none focus:border-vura-500" /></Field><Field label="City"><input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} required className="w-full border border-[#dfe2ea] px-3 py-3 outline-none focus:border-vura-500" /></Field>{error && <p className="text-sm font-semibold text-[#bc4b42]">{error}</p>}</div><div className="border border-[#e6e8ef] bg-[#fafbfe] p-4"><p className="text-xs font-bold uppercase tracking-[.13em] text-[#9299aa]">Order summary</p><div className="mt-4 flex gap-3"><div className="h-16 w-16 bg-white p-2">{product.images?.[0] && <img src={product.images[0]} alt="" className="h-full w-full object-contain"/>}</div><div><p className="text-sm font-bold">{product.name}</p><p className="mt-1 text-xs text-[#7d8596]">Qty {qty}</p></div></div><div className="mt-5 border-t border-[#e0e3eb] pt-4"><div className="flex justify-between text-sm"><span>Subtotal</span><b>{money(total)}</b></div><div className="mt-2 flex justify-between text-sm"><span>Delivery</span><b>Calculated after order</b></div><div className="mt-4 flex justify-between text-base font-black"><span>Total</span><span>{money(total)}</span></div></div><button disabled={busy} className="mt-5 w-full rounded-xl bg-vura-500 px-4 py-3 font-bold text-white disabled:opacity-60">{busy ? 'Creating order...' : 'Place order'}</button></div></div></form></div>}{created && payment && <PaymentModal order={created} payment={payment} onClose={() => setCheckout(false)} />}</main>;
}

function PaymentModal({ order, payment, onClose }: { order: Order; payment: { accountNumber: string; accountName: string; bankName: string }; onClose: () => void }) {
  const [ref, setRef] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const submit = async () => {
    if (!ref.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(apiUrl('/api/orders/payment-submission'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, transferReference: ref.trim() })
      });
      const d = await r.json();
      setMsg(r.ok ? 'Transfer submitted for verification.' : (d.error || 'Unable to submit transfer reference.'));
    } catch {
      setMsg('Unable to submit transfer reference.');
    } finally {
      setBusy(false);
    }
  };
  return <div className="fixed inset-0 z-[70] grid place-items-end bg-black/45 p-0 md:place-items-center md:p-6"><div className="w-full max-w-xl border border-[#dfe2ea] bg-white p-6 shadow-2xl md:p-8"><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-vura-500">Order {order.order_number}</p><h2 className="mt-1 text-2xl font-black">Complete your bank transfer</h2><p className="mt-2 text-sm text-[#7d8596]">Send the exact order total to the Vura account below.</p></div><button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#f5f6fa]"><X size={18}/></button></div><div className="mt-6 border border-[#dcdff0] bg-[#f6f3ff] p-5"><p className="text-xs font-bold uppercase tracking-[.13em] text-[#737b8d]">Bank transfer</p><div className="mt-4 grid gap-3 text-sm"><Row label="Bank" value={payment.bankName}/><Row label="Account name" value={payment.accountName}/><Row label="Account number" value={payment.accountNumber}/><Row label="Amount" value={money(order.total_kobo)}/></div></div><div className="mt-6"><label className="text-sm font-bold">Transfer reference</label><input value={ref} onChange={e => setRef(e.target.value)} placeholder="Enter the reference from your bank" className="mt-2 w-full border border-[#dfe2ea] px-4 py-3 outline-none focus:border-vura-500"/><button onClick={submit} disabled={busy} className="mt-3 w-full rounded-xl bg-[#17182a] px-4 py-3 font-bold text-white disabled:opacity-60">{busy ? 'Submitting...' : 'I have made the transfer'}</button>{msg && <p className="mt-3 text-sm font-semibold text-[#4d6b57]">{msg}</p>}</div><p className="mt-5 text-xs leading-5 text-[#9aa1b0]">Your payment is marked for verification until Vura confirms the transfer. Supplier pricing and sourcing information are never shown here.</p></div></div>;
}

function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4"><span className="text-[#7d8596]">{label}</span><b className="text-right">{value}</b></div>; }
function Spec({ label, value }: { label: string; value: string }) { return <div className="border border-[#eceef3] bg-[#fafbfe] px-3 py-3"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#9ba2b1]">{label}</p><p className="mt-1 font-semibold text-[#394052]">{value}</p></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="text-sm font-bold text-[#3b4151]">{label}</span><span className="mt-2 block">{children}</span></label>; }
function EmptyShelf() { return <div className="col-span-full border border-dashed border-[#dfe2e9] py-20 text-center"><Package className="mx-auto text-[#b6bdc9]" size={38}/><p className="mt-3 font-bold">Fresh listings are coming.</p></div>; }
function DealCard({ title, text, icon }: { title: string; text: string; icon: React.ReactNode }) { return <div className="flex items-center justify-between overflow-hidden border border-[#e2e4eb] bg-white p-6 md:p-8"><div><div className="grid h-12 w-12 place-items-center bg-[#f0edff] text-vura-500">{icon}</div><h3 className="mt-5 text-2xl font-black">{title}</h3><p className="mt-2 text-sm text-[#7b8394]">{text}</p></div><ExternalLink className="text-[#9aa1b2]" size={26}/></div>; }
function TrustItem({ icon, label }: { icon: React.ReactNode; label: string }) { return <div className="flex flex-col items-center gap-2"><span className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-[#c6c8ff]">{icon}</span><span>{label}</span></div>; }

function Footer({ onView }: { onView: (v: View) => void }) { return <footer className="border-t border-[#e5e7ee] bg-white"><div className="mx-auto max-w-[1440px] px-5 py-12 md:px-8"><div className="grid gap-8 md:grid-cols-4"><div><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-lg bg-vura-500 text-white"><Zap size={17} fill="currentColor"/></span><b className="text-xl tracking-[-.06em]">VURA.</b></div><p className="mt-4 max-w-xs text-sm leading-6 text-[#81899a]">Curated products, one storefront, and delivery coordinated by Vura.</p></div><div><p className="font-bold">Shop</p><div className="mt-3 space-y-2 text-sm text-[#7c8495]"><button onClick={() => onView('catalog')} className="block">All products</button><button onClick={() => onView('deals')} className="block">Deals</button><button onClick={() => onView('catalog')} className="block">Phones</button><button onClick={() => onView('catalog')} className="block">Gaming</button></div></div><div><p className="font-bold">Help</p><div className="mt-3 space-y-2 text-sm text-[#7c8495]"><span className="block">Delivery</span><span className="block">Returns</span><span className="block">Support</span></div></div><div><p className="font-bold">Vura</p><div className="mt-3 space-y-2 text-sm text-[#7c8495]"><span className="block">About</span><span className="block">Terms</span><span className="block">Privacy</span></div></div></div><div className="mt-10 flex flex-col justify-between gap-3 border-t border-[#edf0f4] pt-6 text-xs text-[#949baa] md:flex-row"><span>© 2026 Vura. All rights reserved.</span></div></div></footer>; }
