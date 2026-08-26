import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bell, Heart, LayoutGrid, Menu, Search, ShoppingCart, User, X, Zap } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Link, useRouter } from '../router';
import { storefrontApi } from '../lib/api';
import type { CategoryPublic } from '@/types';
import { SearchBox } from './SearchBox';
import { Drawer, IconButton } from './ui';
import { useCart } from '../context/CartContext';

export function Header({ categories }: { categories: CategoryPublic[] }) {
  const router = useRouter();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const catRef = useRef<HTMLDivElement>(null);
  const cartContext = useCart();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = () => {
      storefrontApi.notifications()
        .then((r) => !cancelled && setUnread(r.unreadCount))
        .catch(() => undefined);
    };
    load();
    const interval = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user?.id]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    const onRouteChange = () => {
      setMenuOpen(false);
      setSearchOpen(false);
      setCatOpen(false);
    };
    window.addEventListener('popstate', onRouteChange);
    return () => window.removeEventListener('popstate', onRouteChange);
  }, []);

  const navLink = (to: string, label: string) => (
    <a
      href={to}
      className={`text-sm font-semibold transition hover:text-vura-300 ${router.path === to.split('?')[0] ? 'text-vura-300' : 'text-mid'}`}
      onClick={(e) => {
        e.preventDefault();
        window.history.pushState({}, '', to);
        window.dispatchEvent(new PopStateEvent('popstate'));
        window.scrollTo({ top: 0 });
      }}
    >
      {label}
    </a>
  );

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-[110] focus:rounded-lg focus:bg-vura-500 focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white">
        Skip to content
      </a>
      <header className="sticky top-0 z-[60] border-b border-white/8 bg-[#0B0B12]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:h-[70px] md:px-6">
          <button className="grid h-10 w-10 place-items-center rounded-xl text-hi hover:bg-white/[0.06] lg:hidden" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <Menu size={21} />
          </button>

          <Link to="/" className="flex shrink-0 items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-vura-500 text-white shadow-lg shadow-vura-500/30"><Zap size={18} fill="currentColor" aria-hidden /></span>
            <span className="font-display text-[22px] font-bold tracking-[-0.07em] text-hi">VURA<span className="text-vura-400">.</span></span>
          </Link>

          <nav aria-label="Primary" className="ml-4 hidden items-center gap-5 lg:flex">
            <div ref={catRef} className="relative">
              <button className="flex items-center gap-1.5 text-sm font-semibold text-mid transition hover:text-vura-300" aria-expanded={catOpen} onClick={() => setCatOpen((v) => !v)}>
                <LayoutGrid size={15} aria-hidden /> Categories
              </button>
              {catOpen && (
                <div className="absolute left-0 top-full z-50 mt-2 w-[420px] rounded-2xl border border-white/10 bg-elevated/98 p-3 shadow-2xl shadow-black/50 backdrop-blur-xl">
                  <div className="grid grid-cols-2 gap-1">
                    {categories.map((c) => (
                      <a
                        key={c.id}
                        href={`/c/${c.slug}`}
                        className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-semibold text-mid transition hover:bg-vura-500/10 hover:text-vura-200"
                        onClick={(e) => {
                          e.preventDefault();
                          setCatOpen(false);
                          router.navigate(`/c/${c.slug}`);
                        }}
                      >
                        {c.name}
                        {typeof c.product_count === 'number' && c.product_count > 0 && <span className="text-xs font-medium text-low">{c.product_count}</span>}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {navLink('/deals', 'Deals')}
            {navLink('/new', 'New Arrivals')}
            {navLink('/track', 'Track Order')}
          </nav>

          <div className="mx-auto hidden min-w-0 flex-1 max-w-xl px-2 lg:block">
            <SearchBox />
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <IconButton label="Search" className="lg:hidden" onClick={() => setSearchOpen(true)}><Search size={19} /></IconButton>
            {user && (
              <span className="relative hidden sm:block">
                <Link to="/account/notifications" ariaLabel="Notifications">
                  <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-mid transition hover:bg-white/[0.1] hover:text-hi">
                    <Bell size={18} />
                  </span>
                </Link>
                {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-vura-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? '9+' : unread}</span>}
              </span>
            )}
            <Link to={user ? '/account/wishlist' : '/signin?next=/account/wishlist'} ariaLabel="Wishlist" className="hidden sm:block">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-mid transition hover:bg-white/[0.1] hover:text-hi"><Heart size={18} /></span>
            </Link>
            <Link to="/cart" ariaLabel={`Cart${cartContext.count ? `, ${cartContext.count} items` : ''}`} className="relative">
              <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-mid transition hover:bg-white/[0.1] hover:text-hi"><ShoppingCart size={18} /></span>
              {cartContext.count > 0 && (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-vura-500 px-1 text-[10px] font-bold text-white">{cartContext.count > 99 ? '99+' : cartContext.count}</span>
              )}
            </Link>
            <Link to={user ? '/account' : '/signin'} ariaLabel={user ? 'My account' : 'Sign in'} className="hidden sm:block">
              <span className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm font-semibold text-mid transition hover:bg-white/[0.1] hover:text-hi">
                <User size={16} />
                <span className="max-w-24 truncate">{user ? user.name.split(' ')[0] : 'Sign in'}</span>
              </span>
            </Link>
          </div>
        </div>

        {searchOpen && (
          <div className="border-t border-white/8 p-4 lg:hidden">
            <SearchBox autoFocus placeholder="Search Vura..." onNavigate={() => setSearchOpen(false)} />
          </div>
        )}
      </header>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
        <nav aria-label="Mobile" className="space-y-1">
          {[['/', 'Home'], ['/deals', 'Deals'], ['/new', 'New arrivals'], ['/track', 'Track order'], ['/help', 'Help & support'], [user ? '/account' : '/signin', user ? 'My Vura account' : 'Sign in'], [user ? '/account/orders' : '/signup', user ? 'My orders' : 'Create account']].map(([to, label]) => (
            <a
              key={to}
              href={to}
              className="block rounded-xl px-3 py-3 text-sm font-bold text-hi transition hover:bg-white/[0.06]"
              onClick={(e) => {
                e.preventDefault();
                setMenuOpen(false);
                router.navigate(to);
              }}
            >
              {label}
            </a>
          ))}
        </nav>
        <p className="mb-2 mt-6 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-low">Categories</p>
        <nav aria-label="Categories" className="space-y-0.5">
          {categories.map((c) => (
            <a
              key={c.id}
              href={`/c/${c.slug}`}
              className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-mid transition hover:bg-vura-500/10 hover:text-vura-200"
              onClick={(e) => {
                e.preventDefault();
                setMenuOpen(false);
                router.navigate(`/c/${c.slug}`);
              }}
            >
              {c.name}
            </a>
          ))}
        </nav>
      </Drawer>
    </>
  );
}

export function MobileTabBar({ cartCount }: { cartCount: number }) {
  const router = useRouter();
  const tab = (to: string, label: string, icon: ReactNode, badge?: number) => {
    const active = router.path === to || (to !== '/' && router.path.startsWith(to));
    return (
      <a
        href={to}
        aria-current={active ? 'page' : undefined}
        className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-bold ${active ? 'text-vura-300' : 'text-low'}`}
        onClick={(e) => {
          e.preventDefault();
          router.navigate(to);
        }}
      >
        {icon}
        {badge != null && badge > 0 && <span className="absolute right-1/4 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-vura-500 px-1 text-[9px] font-bold text-white">{badge > 9 ? '9+' : badge}</span>}
        {label}
      </a>
    );
  };
  return (
    <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-[55] border-t border-white/8 bg-[#0B0B12]/95 backdrop-blur-xl sm:hidden">
      <div className="mx-auto flex max-w-md">
        {tab('/', 'Shop', <LayoutGrid size={20} aria-hidden />)}
        {tab('/deals', 'Deals', <Zap size={20} aria-hidden />)}
        {tab('/cart', 'Cart', <ShoppingCart size={20} aria-hidden />, cartCount)}
        {tab('/account', 'Account', <User size={20} aria-hidden />)}
      </div>
    </nav>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return <IconButton label="Close" onClick={onClick}><X size={18} /></IconButton>;
}
