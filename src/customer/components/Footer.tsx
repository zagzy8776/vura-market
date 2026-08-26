import { Instagram, MessageCircle, ShoppingCart } from 'lucide-react';
import { useRouter } from '../router';

const columns: Array<{ title: string; links: Array<{ label: string; to: string }> }> = [
  {
    title: 'Shop',
    links: [
      { label: 'All products', to: '/search' },
      { label: 'Deals', to: '/deals' },
      { label: 'New arrivals', to: '/new' },
    ],
  },
  {
    title: 'Help',
    links: [
      { label: 'Track order', to: '/track' },
      { label: 'Delivery info', to: '/help#delivery' },
      { label: 'Returns', to: '/help#returns' },
      { label: 'Contact support', to: '/help#contact' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Privacy policy', to: '/privacy.html' },
      { label: 'Terms of service', to: '/terms.html' },
    ],
  },
];

export function Footer({ categories }: { categories: Array<{ name: string; slug: string }> }) {
  const router = useRouter();
  const go = (to: string) => (e: React.MouseEvent) => {
    if (!to.startsWith('/')) {
      window.location.href = to;
      return;
    }
    e.preventDefault();
    router.navigate(to);
  };

  return (
    <footer className="border-t border-[#e8e7f1] bg-white">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-vura-500 text-white">
                <ShoppingCart size={17} strokeWidth={2.4} aria-hidden />
              </span>
              <b className="font-display text-xl tracking-[-0.04em] text-[#151527]">
                VURA <span className="font-semibold text-[#5f6678]">MARKET</span>
              </b>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-6 text-[#5f6678]">
              Shop products sourced for you — clear prices and delivery across Nigeria.
            </p>
            <div className="mt-4 flex gap-2">
              <a href="https://wa.me/" className="grid h-9 w-9 place-items-center rounded-lg bg-[#f3f1ff] text-vura-500" aria-label="WhatsApp">
                <MessageCircle size={16} />
              </a>
              <a href="https://instagram.com/" className="grid h-9 w-9 place-items-center rounded-lg bg-[#f3f1ff] text-vura-500" aria-label="Instagram">
                <Instagram size={16} />
              </a>
            </div>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <p className="font-bold text-[#151527]">{col.title}</p>
              <div className="mt-3 space-y-2 text-sm text-[#5f6678]">
                {col.links.map((link) => (
                  <a key={link.to} href={link.to} onClick={go(link.to)} className="block hover:text-vura-500">
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
        {categories.length > 0 && (
          <div className="mt-10 border-t border-[#e8e7f1] pt-6">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#8b93a5]">Categories</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {categories.slice(0, 12).map((c) => (
                <a
                  key={c.slug}
                  href={`/c/${c.slug}`}
                  onClick={go(`/c/${c.slug}`)}
                  className="rounded-full border border-[#e8e7f1] bg-[#f7f7fb] px-3 py-1.5 text-xs font-semibold text-[#5f6678] hover:border-vura-300 hover:text-vura-500"
                >
                  {c.name}
                </a>
              ))}
            </div>
          </div>
        )}
        <div className="mt-10 flex flex-col justify-between gap-3 border-t border-[#e8e7f1] pt-6 text-xs text-[#8b93a5] md:flex-row">
          <span>© {new Date().getFullYear()} Vura Market. All rights reserved.</span>
          <span>Local sourcing · Lagos delivery</span>
        </div>
      </div>
    </footer>
  );
}
