import { useEffect, useRef } from 'react';
import { ShoppingCart, Trash2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { money } from '@/lib/money';
import { Link } from '../router';
import { optimizedImage } from '../lib/images';
import { Button, QuantityStepper, useEscapeKey } from './ui';

export function CartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cart = useCart();
  const panelRef = useRef<HTMLDivElement>(null);
  useEscapeKey(open, onClose);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[85] bg-black/70 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && onClose()} role="presentation">
      <aside ref={panelRef} role="dialog" aria-modal="true" aria-label="Your cart" className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-elevated shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-hi"><ShoppingCart size={18} className="text-vura-300" aria-hidden /> Your cart</h2>
          <button onClick={onClose} aria-label="Close cart" className="grid h-9 w-9 place-items-center rounded-lg text-mid hover:bg-white/[0.06] hover:text-hi">✕</button>
        </header>

        {cart.lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-white/[0.05] text-low"><ShoppingCart size={28} /></span>
            <p className="font-bold text-hi">Your cart is empty</p>
            <p className="text-sm text-mid">Browse the catalog and add something you love.</p>
            <Link to="/search" onClick={onClose}><Button>Start shopping</Button></Link>
          </div>
        ) : (
          <>
            <ul className="flex-1 divide-y divide-white/6 overflow-auto px-5">
              {cart.lines.map((line) => {
                const key = `${line.productId}::${line.variantId || ''}`;
                return (
                  <li key={key} className="flex gap-3 py-4">
                    <Link to={`/product/${line.slug}`} onClick={onClose} className="shrink-0">
                      {line.image ? (
                        <img src={optimizedImage(line.image, 112)} alt="" width={56} height={56} className="h-14 w-14 rounded-xl object-cover" loading="lazy" />
                      ) : (
                        <span className="grid h-14 w-14 place-items-center rounded-xl bg-white/[0.05] text-low"><ShoppingCart size={18} /></span>
                      )}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link to={`/product/${line.slug}`} onClick={onClose} className="block truncate text-sm font-bold text-hi hover:text-vura-300">{line.name}</Link>
                      {line.variantLabel && <p className="truncate text-xs text-low">{line.variantLabel}</p>}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <QuantityStepper small value={line.quantity} max={Math.min(line.maxQuantity, 10)} onChange={(q) => cart.setQty(line.productId, line.variantId, q)} />
                        <b className="text-sm font-bold text-hi">{money(line.unitPriceKobo * line.quantity)}</b>
                      </div>
                    </div>
                    <button onClick={() => cart.remove(line.productId, line.variantId)} aria-label={`Remove ${line.name} from cart`} className="self-start rounded-lg p-1.5 text-low transition hover:bg-red-500/10 hover:text-red-400">
                      <Trash2 size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
            <footer className="border-t border-white/8 p-5">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-mid">Subtotal</span>
                <b className="text-hi">{money(cart.subtotalKobo)}</b>
              </div>
              <p className="mb-4 text-xs text-low">Delivery is calculated at checkout for your state.</p>
              <Link to="/checkout" onClick={onClose} className="block">
                <Button size="lg" className="w-full">Proceed to Checkout</Button>
              </Link>
              <button onClick={onClose} className="mt-2 w-full rounded-xl py-2 text-sm font-semibold text-mid transition hover:text-hi">Continue shopping</button>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
