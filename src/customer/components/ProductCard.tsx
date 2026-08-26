import { memo, useState } from 'react';
import { Heart, Package, ShoppingCart, Eye } from 'lucide-react';
import type { StorefrontProduct } from '@/types';
import { money } from '@/lib/money';
import { Link, useRouter } from '../router';
import { availabilityFor, discountPercent } from '../lib/availability';
import { optimizedImage } from '../lib/images';
import { Badge, Price, cx } from './ui';
import { useWishlist } from '../context/WishlistContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { Modal } from './ui';
import { effectivePriceKobo, variantAvailable } from '../lib/variants';

type Props = { product: StorefrontProduct; priority?: boolean };

function ProductCardInner({ product, priority }: Props) {
  const router = useRouter();
  const wishlist = useWishlist();
  const cart = useCart();
  const toast = useToast();
  const [quickView, setQuickView] = useState(false);
  const saved = wishlist.has(product.id);
  const image = product.images?.[0] ? optimizedImage(product.images[0], 560) : '';
  const discount = discountPercent(Number(product.price_kobo), product.compare_at_price_kobo ? Number(product.compare_at_price_kobo) : null);
  const variantList = (product.variants || []).map((v) => ({ ...v, available_quantity: v.available_quantity, reserved_quantity: v.reserved_quantity }));
  const firstAvailable = variantList.find((v) => v.available_quantity - v.reserved_quantity > 0) || variantList[0] || null;
  const availability = availabilityFor(product.stock_status, variantList.length ? (firstAvailable ? firstAvailable.available_quantity - firstAvailable.reserved_quantity : 0) : null);

  const addToCart = () => {
    if (!availability.purchasable) {
      toast.push({ kind: 'error', title: 'Unavailable', description: `${product.name} cannot be purchased right now.` });
      return;
    }
    cart.add({
      productId: product.id,
      variantId: firstAvailable?.id ?? null,
      slug: product.slug,
      name: product.name,
      image: product.images?.[0] || null,
      unitPriceKobo: Number(effectivePriceKobo({ price_kobo: Number(product.price_kobo) }, firstAvailable)),
      compareAtPriceKobo: product.compare_at_price_kobo ? Number(product.compare_at_price_kobo) : null,
      quantity: 1,
      maxQuantity: firstAvailable ? Math.min(variantAvailable(firstAvailable), 10) : 10,
      variantLabel: firstAvailable && variantList.length ? Object.values(firstAvailable.attributes || {}).join(' · ') : undefined,
    });
    toast.push({ kind: 'success', title: 'Added to cart', description: product.name });
  };

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-vura-500/40 hover:shadow-xl hover:shadow-vura-950/40">
      <Link to={`/product/${product.slug}`} ariaLabel={product.name} className="relative block aspect-square overflow-hidden bg-[#10101A]">
        {image ? (
          <img
            src={image}
            alt={product.name}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            width={560}
            height={560}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <span className="grid h-full w-full place-items-center text-low"><Package size={44} aria-hidden /></span>
        )}
        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          {discount != null && <Badge tone="danger">-{discount}%</Badge>}
          {!availability.purchasable && <Badge tone={availability.tone}>{availability.label}</Badge>}
          {availability.purchasable && availability.state === 'limited' && <Badge tone="warning">{availability.label}</Badge>}
        </div>
      </Link>

      <button
        type="button"
        aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
        aria-pressed={saved}
        onClick={(e) => {
          e.preventDefault();
          void wishlist.toggle({ id: product.id, name: product.name });
        }}
        className={cx('absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full border backdrop-blur transition', saved ? 'border-vura-400/40 bg-vura-500/25 text-vura-200' : 'border-white/12 bg-black/40 text-white/70 opacity-100 hover:text-vura-300 sm:opacity-0 sm:group-hover:opacity-100')}
      >
        <Heart size={16} fill={saved ? 'currentColor' : 'none'} aria-hidden />
      </button>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-low">{product.brand}</p>
        <Link to={`/product/${product.slug}`} className="line-clamp-2 min-h-[40px] text-sm font-bold leading-snug text-hi hover:text-vura-300">{product.name}</Link>
        <Price priceKobo={Number(product.price_kobo)} compareAtKobo={product.compare_at_price_kobo ? Number(product.compare_at_price_kobo) : null} />
        <div className="mt-auto flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={addToCart}
            disabled={!availability.purchasable}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-vura-500 text-sm font-bold text-white transition hover:bg-vura-600 disabled:cursor-not-allowed disabled:bg-white/[0.07] disabled:text-low"
          >
            <ShoppingCart size={15} aria-hidden />
            {availability.purchasable ? 'Add to Cart' : availability.state === 'source_on_demand' ? 'Source only' : 'Sold out'}
          </button>
          <button
            type="button"
            aria-label={`Quick view ${product.name}`}
            onClick={() => setQuickView(true)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/12 text-mid transition hover:border-vura-400/40 hover:text-hi"
          >
            <Eye size={16} aria-hidden />
          </button>
        </div>
      </div>

      <Modal open={quickView} onClose={() => setQuickView(false)} title={product.name}>
        <QuickViewContent product={product} onAdded={() => { setQuickView(false); router.navigate('/cart'); }} />
      </Modal>
    </article>
  );
}

export function QuickViewContent({ product, onAdded }: { product: StorefrontProduct; onAdded?: () => void }) {
  const cart = useCart();
  const toast = useToast();
  const variants = product.variants || [];
  const first = variants[0] || null;
  const price = Number(first?.price_kobo ?? product.price_kobo);
  return (
    <div className="space-y-4">
      <div className="aspect-video overflow-hidden rounded-2xl bg-[#10101A]">
        {product.images?.[0] ? (
          <img src={optimizedImage(product.images[0], 720)} alt={product.name} className="h-full w-full object-contain" loading="lazy" decoding="async" />
        ) : (
          <span className="grid h-full place-items-center text-low"><Package size={40} /></span>
        )}
      </div>
      <Price priceKobo={price} compareAtKobo={product.compare_at_price_kobo ? Number(product.compare_at_price_kobo) : null} />
      <p className="line-clamp-3 text-sm leading-6 text-mid">{product.description}</p>
      <ul className="space-y-1 text-xs font-semibold text-mid">
        <li>Brand: {product.brand}</li>
        <li>Condition: {product.condition_label}</li>
        {product.category_name && <li>Category: {product.category_name}</li>}
      </ul>
      <button
        type="button"
        onClick={() => {
          cart.add({
            productId: product.id,
            variantId: first?.id ?? null,
            slug: product.slug,
            name: product.name,
            image: product.images?.[0] || null,
            unitPriceKobo: price,
            quantity: 1,
            maxQuantity: first ? Math.min(variantAvailable(first), 10) : 10,
          });
          toast.push({ kind: 'success', title: 'Added to cart', description: product.name });
          onAdded?.();
        }}
        disabled={variants.length > 0}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-vura-500 text-sm font-bold text-white transition hover:bg-vura-600 disabled:cursor-not-allowed disabled:bg-white/[0.07] disabled:text-low"
      >
        <ShoppingCart size={16} aria-hidden />
        {variants.length > 0 ? 'Choose options on the product page' : `Add to cart · ${money(price)}`}
      </button>
      {onAdded && <p className="text-center text-xs text-low">Opens your cart after adding.</p>}
    </div>
  );
}

export const ProductCard = memo(ProductCardInner);
