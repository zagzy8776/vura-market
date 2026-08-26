import type { ProductVariantPublic } from '@/types';

export type VariantSelection = Record<string, string>;

export function variantAvailable(v: ProductVariantPublic): number {
  return Math.max(0, Number(v.available_quantity || 0) - Number(v.reserved_quantity || 0));
}

export function groupVariantAttributes(variants: ProductVariantPublic[]): Array<{ key: string; values: string[] }> {
  const groups = new Map<string, string[]>();
  for (const variant of variants) {
    for (const [key, value] of Object.entries(variant.attributes || {})) {
      const list = groups.get(key) || [];
      if (!list.includes(value)) list.push(value);
      groups.set(key, list);
    }
  }
  return [...groups.entries()].map(([key, values]) => ({ key, values }));
}

function matches(variant: ProductVariantPublic, selection: VariantSelection): boolean {
  const attrs = variant.attributes || {};
  return Object.keys(selection).length > 0 && Object.entries(selection).every(([key, value]) => attrs[key] === value);
}

export function findVariant(variants: ProductVariantPublic[], selection: VariantSelection): ProductVariantPublic | null {
  return variants.find((v) => matches(v, selection)) || null;
}

export function findAvailableVariant(variants: ProductVariantPublic[], selection: VariantSelection): ProductVariantPublic | null {
  const variant = findVariant(variants, selection);
  return variant && variantAvailable(variant) > 0 ? variant : null;
}

export function initialSelection(variants: ProductVariantPublic[]): VariantSelection {
  for (const variant of variants) {
    if (variantAvailable(variant) > 0) return { ...(variant.attributes || {}) };
  }
  return variants[0] ? { ...(variants[0].attributes || {}) } : {};
}

// Auto-corrects a selection that has no exact variant (e.g. Black + 512GB does
// not exist): keeps the current value for keys where it still exists and fills
// the rest from the closest AVAILABLE variant.
export function resolveSelection(variants: ProductVariantPublic[], selection: VariantSelection): VariantSelection {
  if (findAvailableVariant(variants, selection)) return selection;
  const groups = groupVariantAttributes(variants);
  let best: VariantSelection | null = null;
  let bestScore = -1;
  for (const candidateBase of variants.filter((v) => variantAvailable(v) > 0)) {
    const candidate: VariantSelection = {};
    for (const g of groups) {
      candidate[g.key] =
        selection[g.key] && candidateBase.attributes?.[g.key] !== undefined
          ? selection[g.key]
          : candidateBase.attributes?.[g.key] ?? '';
    }
    if (!findAvailableVariant(variants, candidate)) continue;
    let score = 0;
    for (const [key, value] of Object.entries(selection)) if (candidate[key] === value) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  if (best) return best;
  return initialSelection(variants);
}

export function effectivePriceKobo(product: { price_kobo: number }, variant: ProductVariantPublic | null): number {
  return variant?.price_kobo ?? product.price_kobo;
}

export function variantLabel(variant: ProductVariantPublic | null): string {
  if (!variant) return '';
  return Object.entries(variant.attributes || {})
    .map(([key, value]) => `${key}: ${value}`)
    .join(' · ') || variant.name;
}
