import { useMemo } from 'react';
import {
  Baby,
  Car,
  Dumbbell,
  Gamepad2,
  Headphones,
  Home as HomeIcon,
  Laptop,
  Package,
  PackageSearch,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Watch,
} from 'lucide-react';
import { Link } from '../router';
import type { CategoryPublic } from '@/types';

const ICONS: Record<string, typeof Headphones> = {
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
  phones: Smartphone,
  phone: Smartphone,
  laptops: Laptop,
  laptop: Laptop,
  gaming: Gamepad2,
  audio: Headphones,
  wearables: Watch,
  accessories: Package,
  computers: Laptop,
};

function iconFor(slug: string) {
  return ICONS[slug] || ICONS[slug.split('-')[0]] || PackageSearch;
}

export function CategoriesPage({ categories }: { categories: CategoryPublic[] }) {
  const list = useMemo(
    () =>
      categories.map((c) => ({
        ...c,
        Icon: iconFor(c.slug),
      })),
    [categories],
  );

  return (
    <main id="main" className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-low">Browse</p>
      <h1 className="mt-1 font-display text-3xl font-black tracking-tight text-hi">Categories</h1>
      <p className="mt-2 text-sm text-mid">Pick a category to see products in stock.</p>

      {list.length === 0 ? (
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-[#ececf3]" />
          ))}
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {list.map((c) => (
            <li key={c.id || c.slug}>
              <Link
                to={`/c/${c.slug}`}
                className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-[#e8e7f1] bg-white px-4 py-6 text-center transition hover:border-vura-300 hover:shadow-md hover:shadow-vura-500/10"
              >
                <span className="grid h-14 w-14 place-items-center rounded-full bg-vura-500/10 text-vura-500">
                  <c.Icon size={26} aria-hidden />
                </span>
                <span className="text-sm font-bold text-hi">{c.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10 text-center">
        <Link to="/search" className="text-sm font-bold text-vura-500 hover:underline">
          Search all products →
        </Link>
      </div>
    </main>
  );
}
