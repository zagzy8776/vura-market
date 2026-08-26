import { Instagram, MessageCircle, Zap } from 'lucide-react';
import { useRouter } from '../router';

const columns: Array<{ title: string; links: Array<{ label: string; to: string }> }> = [
  {
    title: 'Shop',
    links: [
      { label: 'All products', to: '/search' },
      { label: 'Deals', to: '/deals' },
      { label: 'New arrivals', to: '/new' },
      { label: 'Track order', to: '/track' },
    ],
  },
  {
    title: 'Customer service',
    links: [
      { label: 'Help & FAQ', to: '/help' },
      { label: 'Delivery information', to: '/help#delivery' },
      { label: 'Returns & refunds', to: '/help#returns' },
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
    <footer className="border-t border-white/8 bg-[#0A0A10] pb-20 sm:pb-0">
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
        <div className="grid gap-10 md:grid-cols-[1.3fr_repeat(3,1fr)]">
          <div>
            <span className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-vura-500 text-white"><Zap size={17} fill="currentColor" aria-hidden /></span>
              <b className="font-display text-xl tracking-[-0.06em] text-hi">VURA<span className="text-vura-400">.</span></b>
            </span>
            <p className="mt-4 max-w-xs text-sm leading-6 text-low">
              A Nigerian marketplace for electronics, machinery, tools and everyday essentials — sourced for you and delivered across the country.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <a href="https://wa.me/" target="_blank" rel="noopener noreferrer" aria-label="Vura on WhatsApp" className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-mid transition hover:border-vura-400/40 hover:text-hi"><MessageCircle size={18} /></a>
              <a href="https://instagram.com/" target="_blank" rel="noopener noreferrer" aria-label="Vura on Instagram" className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-mid transition hover:border-vura-400/40 hover:text-hi"><Instagram size={18} /></a>
            </div>
          </div>
          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="text-sm font-bold text-hi">{col.title}</p>
              <ul className="mt-3 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.to} onClick={go(link.to)} className="text-sm text-mid transition hover:text-vura-300">{link.label}</a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {categories.length > 0 && (
          <div className="mt-10 border-t border-white/6 pt-8">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-low">Popular categories</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {categories.slice(0, 14).map((c) => (
                <a key={c.slug} href={`/c/${c.slug}`} onClick={go(`/c/${c.slug}`)} className="text-sm font-semibold text-mid transition hover:text-vura-300">{c.name}</a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-10 flex flex-col justify-between gap-3 border-t border-white/6 pt-6 text-xs text-low sm:flex-row">
          <span>© {new Date().getFullYear()} Vura. All rights reserved.</span>
          <span>Secure checkout · Nationwide delivery · Support on WhatsApp</span>
        </div>
      </div>
    </footer>
  );
}
