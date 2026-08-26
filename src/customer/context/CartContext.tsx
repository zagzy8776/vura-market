import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { storefrontApi } from '../lib/api';
import { variantAvailable } from '../lib/variants';
import { track } from '../lib/analytics';
import type { StorefrontProduct } from '@/types';

export type CartLine = {
  productId: string;
  variantId: string | null;
  slug: string;
  name: string;
  image?: string | null;
  unitPriceKobo: number;
  compareAtPriceKobo?: number | null;
  quantity: number;
  maxQuantity: number;
  variantLabel?: string;
};

export type CartIssue = {
  key: string;
  name: string;
  type: 'price_changed' | 'unavailable' | 'removed' | 'quantity_capped';
  detail?: string;
};

type CartState = { lines: CartLine[] };

type CartAction =
  | { type: 'hydrate'; lines: CartLine[] }
  | { type: 'add'; line: CartLine }
  | { type: 'setQty'; key: string; quantity: number }
  | { type: 'remove'; key: string }
  | { type: 'clear' }
  | { type: 'revalidate'; products: StorefrontProduct[] };

export const lineKey = (productId: string, variantId?: string | null) => `${productId}::${variantId || ''}`;

const STORAGE_KEY = 'vura_cart_v1';
export const MAX_LINE_QTY = 10;

function reducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'hydrate':
      return { lines: action.lines };
    case 'add': {
      const key = lineKey(action.line.productId, action.line.variantId);
      const existing = state.lines.find((l) => lineKey(l.productId, l.variantId) === key);
      if (existing) {
        const nextQty = Math.min(existing.quantity + action.line.quantity, Math.min(existing.maxQuantity || MAX_LINE_QTY, MAX_LINE_QTY));
        return { lines: state.lines.map((l) => (lineKey(l.productId, l.variantId) === key ? { ...l, ...action.line, quantity: nextQty } : l)) };
      }
      return { lines: [...state.lines, action.line] };
    }
    case 'setQty':
      return {
        lines: state.lines
          .map((l) => (lineKey(l.productId, l.variantId) === action.key ? { ...l, quantity: Math.max(1, Math.min(action.quantity, Math.min(l.maxQuantity || MAX_LINE_QTY, MAX_LINE_QTY))) } : l))
          .filter((l) => l.quantity > 0),
      };
    case 'remove':
      return { lines: state.lines.filter((l) => lineKey(l.productId, l.variantId) !== action.key) };
    case 'clear':
      return { lines: [] };
    case 'revalidate': {
      if (!state.lines.length) return state;
      const byId = new Map(action.products.map((p) => [p.id, p]));
      let changed = false;
      const issues: CartIssue[] = [];
      const next: CartLine[] = [];
      for (const line of state.lines) {
        const product = byId.get(line.productId);
        if (!product) {
          changed = true;
          issues.push({ key: lineKey(line.productId, line.variantId), name: line.name, type: 'removed', detail: 'This product is no longer listed.' });
          continue;
        }
        const variant = product.variants?.find((v) => v.id === line.variantId) || null;
        const price = Number(variant?.price_kobo ?? product.price_kobo);
        const available = variant ? variantAvailable(variant) : (product.stock_status === 'available' ? MAX_LINE_QTY : 0);
        if (!variant && product.variants && product.variants.length > 0) {
          changed = true;
          continue;
        }
        if (available <= 0 || product.stock_status === 'out_of_stock') {
          changed = true;
          issues.push({ key: lineKey(line.productId, line.variantId), name: line.name, type: 'unavailable', detail: 'Sold out while you were shopping.' });
          continue;
        }
        const capped = Math.min(available, MAX_LINE_QTY);
        let quantity = line.quantity;
        if (quantity > capped) {
          quantity = capped;
          changed = true;
          issues.push({ key: lineKey(line.productId, line.variantId), name: line.name, type: 'quantity_capped', detail: `Only ${capped} left in stock.` });
        }
        if (price !== line.unitPriceKobo) {
          changed = true;
          issues.push({ key: lineKey(line.productId, line.variantId), name: line.name, type: 'price_changed', detail: 'The price was updated to the current price.' });
        }
        next.push({ ...line, unitPriceKobo: price, compareAtPriceKobo: product.compare_at_price_kobo ?? null, quantity, maxQuantity: capped });
      }
      return changed ? { lines: next } : state;
    }
    default:
      return state;
  }
}

function loadInitial(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartLine[];
    return Array.isArray(parsed) ? parsed.filter((l) => typeof l?.productId === 'string' && Number(l?.unitPriceKobo) > 0).slice(0, 50) : [];
  } catch {
    return [];
  }
}

export function revalidateIssues(before: CartLine[], after: CartLine[]): CartIssue[] {
  const beforeMap = new Map(before.map((l) => [lineKey(l.productId, l.variantId), l] as const));
  const afterKeys = new Set(after.map((l) => lineKey(l.productId, l.variantId)));
  const issues: CartIssue[] = [];
  for (const [key, line] of beforeMap) {
    if (!afterKeys.has(key)) issues.push({ key, name: line.name, type: 'unavailable', detail: 'No longer available.' });
  }
  for (const line of after) {
    const prev = beforeMap.get(lineKey(line.productId, line.variantId));
    if (prev && prev.unitPriceKobo !== line.unitPriceKobo) issues.push({ key: lineKey(line.productId, line.variantId), name: line.name, type: 'price_changed', detail: 'Price updated.' });
    if (prev && prev.quantity !== line.quantity) issues.push({ key: lineKey(line.productId, line.variantId), name: line.name, type: 'quantity_capped', detail: `Quantity adjusted to ${line.quantity}.` });
  }
  return issues;
}

type CartValue = {
  lines: CartLine[];
  count: number;
  subtotalKobo: number;
  add: (line: Omit<CartLine, 'maxQuantity'> & { maxQuantity?: number }) => void;
  setQty: (productId: string, variantId: string | null, quantity: number) => void;
  remove: (productId: string, variantId: string | null) => void;
  clear: () => void;
  revalidate: () => Promise<CartIssue[]>;
};

const CartContext = createContext<CartValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({ lines: loadInitial() }));

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.lines));
    } catch {
      // storage unavailable
    }
  }, [state.lines]);

  const add = useCallback((line: Omit<CartLine, 'maxQuantity'> & { maxQuantity?: number }) => {
    dispatch({ type: 'add', line: { ...line, maxQuantity: line.maxQuantity || MAX_LINE_QTY, quantity: Math.max(1, line.quantity) } });
    track('add_to_cart', { productId: line.productId, variantId: line.variantId, quantity: line.quantity });
  }, []);

  const setQty = useCallback((productId: string, variantId: string | null, quantity: number) => {
    dispatch({ type: 'setQty', key: lineKey(productId, variantId), quantity });
  }, []);

  const remove = useCallback((productId: string, variantId: string | null) => {
    dispatch({ type: 'remove', key: lineKey(productId, variantId) });
    track('remove_from_cart', { productId, variantId });
  }, []);

  const clear = useCallback(() => dispatch({ type: 'clear' }), []);

  const revalidate = useCallback(async (): Promise<CartIssue[]> => {
    const before = state.lines;
    if (!before.length) return [];
    const ids = [...new Set(before.map((l) => l.productId))].slice(0, 60);
    try {
      const result = await storefrontApi.products({ ids, include: 'variants', perPage: 60 });
      dispatch({ type: 'revalidate', products: result.products });
      return revalidateIssues(before, reducer({ lines: before }, { type: 'revalidate', products: result.products }).lines);
    } catch {
      return [{ key: '*', name: 'Cart check failed', type: 'price_changed', detail: 'We could not verify your cart. Prices are confirmed at checkout.' }];
    }
  }, [state.lines]);

  const value = useMemo<CartValue>(() => ({
    lines: state.lines,
    count: state.lines.reduce((n, l) => n + l.quantity, 0),
    subtotalKobo: state.lines.reduce((sum, l) => sum + l.unitPriceKobo * l.quantity, 0),
    add,
    setQty,
    remove,
    clear,
    revalidate,
  }), [state.lines, add, setQty, remove, clear, revalidate]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
