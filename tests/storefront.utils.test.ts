import { describe, it, expect } from 'vitest';
import type { ProductVariantPublic } from '../src/types';
import { availabilityFor, discountPercent, etaDateRange, formatDate } from '../src/customer/lib/availability';
import {
  effectivePriceKobo,
  findVariant,
  groupVariantAttributes,
  initialSelection,
  resolveSelection,
  variantAvailable,
  variantLabel,
} from '../src/customer/lib/variants';
import { lineKey, MAX_LINE_QTY, revalidateIssues, type CartLine } from '../src/customer/context/CartContext';
import { optimizedImage } from '../src/customer/lib/images';

describe('availability mapping', () => {
  it('maps product stock statuses to meaningful storefront states', () => {
    expect(availabilityFor('available').purchasable).toBe(true);
    expect(availabilityFor('source_on_demand').label).toBe('Available to source');
    expect(availabilityFor('coming_soon').purchasable).toBe(false);
    expect(availabilityFor('out_of_stock').state).toBe('out_of_stock');
    expect(availabilityFor('weird_status').purchasable).toBe(false);
  });

  it('derives variant availability from net quantities', () => {
    expect(availabilityFor('available', 0).state).toBe('out_of_stock');
    expect(availabilityFor('available', 2).state).toBe('limited');
    expect(availabilityFor('available', 6).state).toBe('low_stock');
    expect(availabilityFor('available', 50).state).toBe('available');
  });
});

describe('discount math', () => {
  it('computes discount percentage from compare price', () => {
    expect(discountPercent(145000000, 150000000)).toBe(3);
    expect(discountPercent(100, 100)).toBeNull();
    expect(discountPercent(120, 100)).toBeNull();
    expect(discountPercent(100, null)).toBeNull();
  });
});

describe('eta dates', () => {
  it('returns a window that respects min<=max', () => {
    const { from, to } = etaDateRange(2, 5, new Date('2026-08-25T00:00:00Z'));
    expect(from.getTime()).toBeLessThanOrEqual(to.getTime());
    expect(formatDate(from)).toBeTruthy();
  });
});

const variants: ProductVariantPublic[] = [
  { id: 'v1', sku: 'A-BLK-128', name: 'Black 128', attributes: { Color: 'Black', Storage: '128GB' }, price_kobo: 145000000, available_quantity: 4, reserved_quantity: 1 },
  { id: 'v2', sku: 'A-PPL-128', name: 'Purple 128', attributes: { Color: 'Purple', Storage: '128GB' }, price_kobo: 147500000, available_quantity: 2, reserved_quantity: 0 },
  { id: 'v3', sku: 'A-BLK-512', name: 'Black 512', attributes: { Color: 'Black', Storage: '512GB' }, price_kobo: 190000000, available_quantity: 0, reserved_quantity: 0 },
];

describe('variant utilities', () => {
  it('groups attributes preserving values', () => {
    const groups = groupVariantAttributes(variants);
    expect(groups.find((g) => g.key === 'Color')?.values).toEqual(['Black', 'Purple']);
    expect(groups.find((g) => g.key === 'Storage')?.values).toEqual(['128GB', '512GB']);
  });

  it('matches variants by full selection', () => {
    expect(findVariant(variants, { Color: 'Purple', Storage: '128GB' })?.id).toBe('v2');
    expect(findVariant(variants, { Color: 'Green', Storage: '128GB' })).toBeNull();
  });

  it('prefers an available variant for the initial selection', () => {
    const selection = initialSelection(variants);
    expect(selection.Storage).not.toBe('512GB');
    expect(findVariant(variants, selection)?.id).toBe('v1');
  });

  it('auto-corrects impossible selections to the closest available variant', () => {
    const resolved = resolveSelection(variants, { Color: 'Black', Storage: '512GB' });
    expect(findVariant(variants, resolved)?.id).toBe('v1');
  });

  it('computes net availability and effective price', () => {
    expect(variantAvailable(variants[0])).toBe(3);
    expect(effectivePriceKobo({ price_kobo: 100 }, variants[1])).toBe(147500000);
    expect(effectivePriceKobo({ price_kobo: 100 }, null)).toBe(100);
    expect(variantLabel(variants[0])).toBe('Color: Black · Storage: 128GB');
  });
});

const baseLine = (over: Partial<CartLine> = {}): CartLine => ({
  productId: 'p1',
  variantId: null,
  slug: 'p1-slug',
  name: 'Product One',
  unitPriceKobo: 10000,
  quantity: 1,
  maxQuantity: MAX_LINE_QTY,
  ...over,
});

describe('cart revalidation diffing', () => {
  it('reports removed, price changed and capped lines', () => {
    const before = [
      baseLine(),
      baseLine({ productId: 'p2', name: 'Two', unitPriceKobo: 200 }),
      baseLine({ productId: 'p3', name: 'Three', quantity: 3 }),
    ];
    const after = [
      baseLine({ unitPriceKobo: 11000 }),
      baseLine({ productId: 'p3', name: 'Three', quantity: 1 }),
    ];
    const issues = revalidateIssues(before, after);
    expect(issues.filter((i) => i.type === 'unavailable').map((i) => i.name)).toEqual(['Two']);
    expect(issues.filter((i) => i.type === 'price_changed').length).toBe(1);
    expect(issues.filter((i) => i.type === 'quantity_capped').length).toBe(1);
  });

  it('builds stable line keys for variants', () => {
    expect(lineKey('a', 'b')).toBe('a::b');
    expect(lineKey('a')).toBe('a::');
    expect(lineKey('a', null)).toBe(lineKey('a'));
  });
});

describe('cloudinary image optimization', () => {
  it('rewrites cloudinary urls with width transforms', () => {
    const url = optimizedImage('https://res.cloudinary.com/demo/image/upload/v123/phone.jpg', 480);
    expect(url).toContain('w_480,q_auto,f_auto');
    expect(url).toContain('phone.jpg');
  });

  it('passes through non-cloudinary urls untouched', () => {
    expect(optimizedImage('https://example.com/x.jpg', 480)).toBe('https://example.com/x.jpg');
    expect(optimizedImage('', 480)).toBe('');
    expect(optimizedImage(null, 480)).toBe('');
  });
});
