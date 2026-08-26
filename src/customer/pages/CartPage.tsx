import { useEffect, useState } from 'react';
import { ArrowRight, Lock, ShoppingCart, Heart } from 'lucide-react';
import { Link, useRouter } from '../router';
import { useCart, type CartIssue } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { money } from '@/lib/money';
import { Button, EmptyState, QuantityStepper } from '../components/ui';
import { optimizedImage } from '../lib/images';
import { track } from '../lib/analytics';

export function CartPage() {
  const cart = useCart();
  const wishlist = useWishlist();
  const router = useRouter();
  const [issues, setIssues] = useState<CartIssue[]>([]);

  useEffect(() => {
    track('page_view', { page: 'cart' });
    let cancelled = false;
    void cart.revalidate().then((found) => !cancelled && setIssues(found));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (cart.lines.length === 0) {
    return (
      <main id="main" className="mx-auto max-w-3xl px-4 py-20">
        <EmptyState
          icon={<ShoppingCart size={26} />}
          title="Your cart is empty"
          description="Browse trending products, deals and new arrivals — everything ships across Nigeria."
          action={<Link to="/search"><Button size="lg">Start shopping <ArrowRight size={16} /></Button></Link>}
        />
      </main>
    );
  }

  return (
    <main id="main" className="mx-auto max-w-5xl px-4 py-10 md:px-6">
      <h1 className="font-display text-3xl font-black tracking-tight text-hi sm:text-4xl">Your cart</h1>

      {issues.length > 0 && (
        <div role="status" className="mt-4 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4 text-sm text-amber-200">
          <b>Your cart was updated:</b>
          <ul className="mt-1.5 list-inside space-y-0.5">
            {issues.map((issue, i) => (
              <li key={i}><span className="font-bold">{issue.name}</span> — {issue.detail}</li>
            ))}
          </ul>
        </div>
      )}

      <ul className="mt-8 divide-y divide-white/8 border-y border-white/8" aria-label="Cart items">
        {cart.lines.map((line) => {
          const key = `${line.productId}::${line.variantId || ''}`;
          return (
            <li key={key} className="flex gap-4 py-5">
              <Link to={`/product/${line.slug}`} className="shrink-0">
                {line.image ? (
                  <img src={optimizedImage(line.image, 160)} alt="" width={80} height={80} className="h-20 w-20 rounded-2xl object-cover" loading="lazy" />
                ) : (
                  <span className="grid h-20 w-20 place-items-center rounded-2xl bg-white/[0.05] text-low"><ShoppingCart size={22} /></span>
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <Link to={`/product/${line.slug}`} className="block font-bold leading-snug text-hi hover:text-vura-300">{line.name}</Link>
                {line.variantLabel && <p className="mt-0.5 text-xs font-semibold text-low">{line.variantLabel}</p>}
                <p className="mt-1 text-sm text-mid">{money(line.unitPriceKobo)} each</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <QuantityStepper value={line.quantity} max={Math.max(line.maxQuantity, 1)} onChange={(q) => cart.setQty(line.productId, line.variantId, q)} small />
                  <button onClick={() => cart.remove(line.productId, line.variantId)} className="text-xs font-bold text-low transition hover:text-red-400">Remove</button>
                  <button
                    onClick={async () => {
                      await wishlist.toggle({ id: line.productId, name: line.name });
                      cart.remove(line.productId, line.variantId);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-bold text-low transition hover:text-vura-300"
                  >
                    <Heart size={12} /> Save for later
                  </button>
                </div>
              </div>
              <b className="font-display text-lg text-hi">{money(line.unitPriceKobo * line.quantity)}</b>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 rounded-2xl border border-white/8 bg-surface/70 p-6">
        <dl className="space-y-2.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-mid">Subtotal ({cart.count} item{cart.count === 1 ? '' : 's'})</dt>
            <dd className="font-bold text-hi">{money(cart.subtotalKobo)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-mid">Delivery</dt>
            <dd className="font-semibold text-low">Calculated at checkout</dd>
          </div>
          <div className="flex justify-between border-t border-white/10 pt-3 text-base">
            <dt className="font-bold text-hi">Total before delivery</dt>
            <dd className="font-display text-xl font-bold text-vura-300">{money(cart.subtotalKobo)}</dd>
          </div>
        </dl>
        <Button
          size="lg"
          className="mt-6 w-full"
          onClick={async () => {
            track('checkout_started', { items: cart.lines.length, subtotalKobo: cart.subtotalKobo });
            const found = await cart.revalidate();
            setIssues(found);
            const blocking = found.some((issue) => issue.type === 'unavailable' || issue.type === 'removed');
            if (!blocking) router.navigate('/checkout');
          }}
        >
          <Lock size={15} aria-hidden /> Proceed to Checkout
        </Button>
        <p className="mt-3 text-center text-xs text-low">Stock and prices are re-checked against our live inventory at checkout.</p>
      </div>
    </main>
  );
}
