import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import { storefrontApi } from '../lib/api';
import { track } from '../lib/analytics';
import type { StorefrontProduct } from '@/types';

const GUEST_KEY = 'vura_wishlist_v1';

type WishlistValue = {
  ids: string[];
  has: (productId: string) => boolean;
  toggle: (product: Pick<StorefrontProduct, 'id' | 'name'>) => Promise<void>;
  remove: (productId: string) => Promise<void>;
  mergeGuestList: () => Promise<void>;
};

const WishlistContext = createContext<WishlistValue | undefined>(undefined);

function loadGuestIds(): string[] {
  try {
    const raw = localStorage.getItem(GUEST_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveGuestIds(ids: string[]) {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify(ids));
  } catch {
    // storage unavailable
  }
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setIds(loadGuestIds());
      return;
    }
    storefrontApi.wishlist()
      .then((result) => {
        if (!cancelled) setIds(result.items.map((item) => item.id));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const toggle = useCallback(async (product: Pick<StorefrontProduct, 'id' | 'name'>) => {
    const isSaved = ids.includes(product.id);
    if (isSaved) {
      setIds((prev) => prev.filter((x) => x !== product.id));
      if (!user) saveGuestIds(ids.filter((x) => x !== product.id));
      else await storefrontApi.wishlistRemove(product.id).catch(() => undefined);
      return;
    }
    const next = [...ids, product.id];
    setIds(next);
    track('wishlist_add', { productId: product.id });
    if (!user) {
      saveGuestIds(next);
      return;
    }
    await storefrontApi.wishlistAdd(product.id).catch(() => undefined);
  }, [ids, user]);

  const remove = useCallback(async (productId: string) => {
    setIds((prev) => prev.filter((x) => x !== productId));
    if (!user) {
      saveGuestIds(loadGuestIds().filter((x) => x !== productId));
      return;
    }
    await storefrontApi.wishlistRemove(productId).catch(() => undefined);
  }, [user]);

  const mergeGuestList = useCallback(async () => {
    const guestIds = loadGuestIds();
    if (!guestIds.length || !user) return;
    for (const id of guestIds) {
      await storefrontApi.wishlistAdd(id).catch(() => undefined);
    }
    saveGuestIds([]);
    try {
      const result = await storefrontApi.wishlist();
      setIds(result.items.map((item) => item.id));
    } catch {
      // keep optimistic list
    }
  }, [user]);

  const value = useMemo<WishlistValue>(() => ({
    ids,
    has: (productId: string) => ids.includes(productId),
    toggle,
    remove,
    mergeGuestList,
  }), [ids, toggle, remove, mergeGuestList]);

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistValue {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error('useWishlist must be used within WishlistProvider');
  return ctx;
}
