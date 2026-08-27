import { useEffect, useState, type ReactNode } from 'react';
import {
  HelpCircle,
  Home,
  LayoutGrid,
  MapPin,
  Menu,
  Package,
  Search,
  ShoppingCart,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Link, useRouter } from '../router';
import type { CategoryPublic } from '@/types';
import { SearchBox } from './SearchBox';
import { Drawer, IconButton } from './ui';
import { useCart } from '../context/CartContext';

export function Header({ categories }: { categories: CategoryPublic[] }) {
  const router = useRouter();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const cartContext = useCart();

  useEffect(() => {
    const onRouteChange = () => {
      setMenuOpen(false);
      setSearchOpen(false);
    };
    window.addEventListener('popstate', onRouteChange);
    return () => window.removeEventListener('popstate', onRouteChange);
  }, []);

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-[110] focus:rounded-lg focus:bg-vura-500 focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-white"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-[60] border-b border-[#e8e7f1] bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center gap-3 px-4 md:h-[72px] md:px-6">
          <button
            className="grid h-10 w-10 place-items-center rounded-xl text-[#151527] hover:bg-[#f3f1ff] lg:hidden"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={22} />
          </button>

          <Link to="/" className="flex shrink-0 items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-vura-500 text-white shadow-md shadow-vura-500/25">
              <ShoppingCart size={18} strokeWidth={2.4} aria-hidden />
            </span>
            <span className="font-display text-[20px] font-bold tracking-[-0.04em] text-[#151527] sm:text-[22px]">
              VURA <span className="font-semibold text-[#5f6678]">MARKET</span>
            </span>
          </Link>

          <button
            type="button"
            className="ml-1 hidden items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-[#f3f1ff] sm:flex"
            aria-label="Change delivery location"
          >
            <MapPin size={15} className="shrink-0 text-vura-500" aria-hidden />
            <span className="text-[11px] leading-tight">
              <span className="block font-medium text-[#8b93a5]">Deliver to</span>
              <span className="font-bold text-[#151527]">Lagos, Nigeria ▾</span>
            </span>
          </button>

          <div className="mx-2 hidden min-w-0 flex-1 max-w-2xl lg:block">
            <SearchBox placeholder="Search for products, brands and more..." />
          </div>

          <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
            <IconButton label="Search" className="lg:hidden" onClick={() => setSearchOpen(true)}>
              <Search size={19} />
            </IconButton>

            <Link
              to="/track"
              className="hidden flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[#5f6678] transition hover:bg-[#f3f1ff] hover:text-vura-500 md:flex"
            >
              <Package size={18} aria-hidden />
              <span className="text-[10px] font-bold">Track Order</span>
            </Link>

            <Link
              to="/help"
              className="hidden flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[#5f6678] transition hover:bg-[#f3f1ff] hover:text-vura-500 md:flex"
            >
              <HelpCircle size={18} aria-hidden />
              <span className="text-[10px] font-bold">Help</span>
            </Link>

            <Link
              to={user ? '/account' : '/signin'}
              className="hidden flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[#5f6678] transition hover:bg-[#f3f1ff] hover:text-vura-500 sm:flex"
            >
              <User size={18} aria-hidden />
              <span className="text-[10px] font-bold">{user ? user.name.split(' ')[0] : 'Account'}</span>
            </Link>

            <Link
              to="/cart"
              ariaLabel={`Cart${cartContext.count ? `, ${cartContext.count} items` : ''}`}
              className="relative flex flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[#5f6678] transition hover:bg-[#f3f1ff] hover:text-vura-500"
            >
              <ShoppingCart size={18} aria-hidden />
              <span className="text-[10px] font-bold">Cart</span>
              {cartContext.count > 0 && (
                <span className="absolute right-0.5 top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-vura-500 px-1 text-[10px] font-bold text-white">
                  {cartContext.count > 99 ? '99+' : cartContext.count}
                </span>
              )}
            </Link>
          </div>
        </div>

        {searchOpen && (
          <div className="border-t border-[#e8e7f1] p-3 lg:hidden">
            <SearchBox
              autoFocus
              placeholder="Search for products, brands and more..."
              onNavigate={() => setSearchOpen(false)}
            />
          </div>
        )}
      </header>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
        <nav aria-label="Mobile" className="space-y-1">
          {(
            [
              ['/', 'Home'],
              ['/deals', 'Deals'],
              ['/new', 'New arrivals'],
              ['/track', 'Track order'],
              ['/help', 'Help & support'],
              [user ? '/account' : '/signin', user ? 'My account' : 'Sign in'],
              [user ? '/account/orders' : '/signup', user ? 'My orders' : 'Create account'],
            ] as const
          ).map(([to, label]) => (
            <a
              key={to}
              href={to}
              className="block rounded-xl px-3 py-3 text-sm font-bold text-[#151527] transition hover:bg-[#f3f1ff]"
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
        <p className="mb-2 mt-6 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#8b93a5]">
          Categories
        </p>
        <nav aria-label="Categories" className="space-y-0.5">
          {categories.map((c) => (
            <a
              key={c.id}
              href={`/c/${c.slug}`}
              className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-[#5f6678] transition hover:bg-[#f3f1ff] hover:text-vura-500"
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
        className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-bold ${
          active ? 'text-vura-500' : 'text-[#8b93a5]'
        }`}
        onClick={(e) => {
          e.preventDefault();
          router.navigate(to);
        }}
      >
        {icon}
        {badge != null && badge > 0 && (
          <span className="absolute right-1/4 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-vura-500 px-1 text-[9px] font-bold text-white">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
        {label}
      </a>
    );
  };

  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-[55] border-t border-[#e8e7f1] bg-white/95 backdrop-blur-xl sm:hidden safe-bottom"
    >
      <div className="mx-auto flex max-w-md">
        {tab('/', 'Home', <Home size={20} aria-hidden />)}
        {tab('/categories', 'Categories', <LayoutGrid size={20} aria-hidden />)}
        {tab('/cart', 'Cart', <ShoppingCart size={20} aria-hidden />, cartCount)}
        {tab('/track', 'Orders', <Package size={20} aria-hidden />)}
        {tab('/account', 'Account', <User size={20} aria-hidden />)}
      </div>
    </nav>
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <IconButton label="Close" onClick={onClick}>
      <X size={18} />
    </IconButton>
  );
}
