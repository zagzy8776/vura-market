import { Suspense, lazy, useEffect, useState } from 'react';
import { RouterProvider, useRouter } from './router';
import { CartProvider, useCart } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';
import { ToastProvider } from './context/ToastContext';
import { Header, MobileTabBar } from './components/Header';
import { Footer } from './components/Footer';
import { CartDrawer } from './components/CartDrawer';
import { storefrontApi } from './lib/api';
import { track } from './lib/analytics';
import { setSiteJsonLd } from './lib/seo';
import type { CategoryPublic } from '@/types';

const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const CatalogPage = lazy(() => import('./pages/CatalogPage').then((m) => ({ default: m.CatalogPage })));
const ProductPage = lazy(() => import('./pages/ProductPage').then((m) => ({ default: m.ProductPage })));
const CartPage = lazy(() => import('./pages/CartPage').then((m) => ({ default: m.CartPage })));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage').then((m) => ({ default: m.CheckoutPage })));
const TrackPage = lazy(() => import('./pages/TrackPage').then((m) => ({ default: m.TrackPage })));
const TrackDetailPage = lazy(() => import('./pages/TrackDetailPage').then((m) => ({ default: m.TrackDetailPage })));
const AuthPage = lazy(() => import('./pages/AuthPage').then((m) => ({ default: m.AuthPage })));
const HelpPage = lazy(() => import('./pages/HelpPage').then((m) => ({ default: m.HelpPage })));
const NotFoundPage = lazy(() => import('./pages/HelpPage').then((m) => ({ default: m.NotFoundPage })));
const AccountPageLazy = lazy(() => import('./pages/AccountPage').then((m) => ({ default: m.AccountPage })));

function AccountTabGuard({ tab }: { tab: 'orders' | 'wishlist' | 'notifications' | 'profile' }) {
  return <AccountPageLazy tab={tab} />;
}

function RouteView({ categories }: { categories: CategoryPublic[] }) {
  const router = useRouter();
  const path = router.path.replace(/\/+$/, '') || '/';

  if (path === '/' || path === '') return <HomePage categories={categories} />;
  if (path === '/deals') return <CatalogPage mode="deals" categories={categories} />;
  if (path === '/new') return <CatalogPage mode="new" categories={categories} />;
  if (path === '/search') return <CatalogPage mode="search" categories={categories} />;
  if (path.startsWith('/c/')) return <CatalogPage mode="category" categorySlug={path.slice(3)} categories={categories} />;
  if (path.startsWith('/product/')) return <ProductPage slug={decodeURIComponent(path.slice('/product/'.length))} />;
  if (path === '/cart') return <CartPage />;
  if (path === '/checkout') return <CheckoutPage />;
  if (path === '/track' || path === '/orders') return <TrackPage />;
  if (path.startsWith('/track/')) return <TrackDetailPage orderId={path.slice('/track/'.length)} />;
  if (path.startsWith('/account/orders')) return <AccountTabGuard tab="orders" key="orders" />;
  if (path.startsWith('/account/wishlist')) return <AccountTabGuard tab="wishlist" key="wishlist" />;
  if (path.startsWith('/account/notifications')) return <AccountTabGuard tab="notifications" key="notifications" />;
  if (path.startsWith('/account/profile')) return <AccountTabGuard tab="profile" key="profile" />;
  if (path === '/account') return <AccountTabGuard tab="orders" key="root" />;
  if (path === '/signin') return <AuthPage mode="signin" />;
  if (path === '/signup') return <AuthPage mode="signup" />;
  if (path === '/help') return <HelpPage />;
  return <NotFoundPage />;
}

function Shell() {
  const router = useRouter();
  const cart = useCart();
  const [categories, setCategories] = useState<CategoryPublic[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    document.body.classList.add('storefront');
    setSiteJsonLd();
    storefrontApi.categories()
      .then((r) => setCategories(r.categories))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    track('page_view', { path: router.path });
  }, [router.path]);

  useEffect(() => {
    const openHandler = (e: Event) => {
      if ((e as CustomEvent).detail?.reason === 'added') setDrawerOpen(true);
    };
    window.addEventListener('vura:open-cart', openHandler);
    return () => window.removeEventListener('vura:open-cart', openHandler);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-hi">
      <Header categories={categories} />
      <div className="flex-1 pb-20 sm:pb-0">
        <Suspense fallback={<PageLoader />}>
          <RouteView categories={categories} />
        </Suspense>
      </div>
      <Footer categories={categories.map((c) => ({ name: c.name, slug: c.slug }))} />
      <MobileTabBar cartCount={cart.count} />
      <CartDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}

function PageLoader() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 md:px-6">
      <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="aspect-square animate-pulse rounded-3xl bg-[#e8e7f1]" />
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-[#e8e7f1]" style={{ width: `${90 - i * 15}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CustomerApp() {
  return (
    <RouterProvider>
      <ToastProvider>
        <CartProvider>
          <WishlistProvider>
            <Shell />
          </WishlistProvider>
        </CartProvider>
      </ToastProvider>
    </RouterProvider>
  );
}
