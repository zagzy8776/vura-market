import type { CategoryPublic, CreatedOrder, CustomerOrder, DeliveryQuote, NigeriaLga, NigeriaState, StorefrontProduct } from '@/types';

type Json = Record<string, unknown>;

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok) {
    const error = new Error((data as { error?: string }).error || `Request failed (${res.status})`);
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }
  return data as T;
}

export type ProductQuery = {
  q?: string;
  category?: string;
  brand?: string;
  sort?: 'newest' | 'price_asc' | 'price_desc' | 'popular';
  deals?: boolean;
  inStock?: boolean;
  minPrice?: number;
  maxPrice?: number;
  ids?: string[];
  include?: 'variants';
  page?: number;
  perPage?: number;
};

export type ProductListResult = {
  products: StorefrontProduct[];
  total: number;
  page: number;
  perPage: number;
  pages: number;
  facets?: { brands: Array<{ brand: string; count: number }> };
};

function qs(params: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const out = search.toString();
  return out ? `?${out}` : '';
}

export const storefrontApi = {
  products(query: ProductQuery = {}) {
    return request<ProductListResult>(`/api/products${qs({
      q: query.q,
      category: query.category,
      brand: query.brand,
      sort: query.sort,
      deals: query.deals ? 1 : undefined,
      inStock: query.inStock ? 1 : undefined,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      ids: query.ids?.length ? query.ids.join(',') : undefined,
      include: query.include,
      page: query.page,
      perPage: query.perPage,
    })}`);
  },
  product(slugOrId: string, opts?: { countView?: boolean }) {
    const key = slugOrId;
    const bySlug = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key) ? undefined : key;
    const byId = bySlug ? undefined : key;
    return request<{ product: StorefrontProduct; variants: StorefrontProduct['variants'] }>(`/api/products${qs({ slug: bySlug, id: byId, view: opts?.countView ? 1 : undefined })}`);
  },
  categories() {
    return request<{ categories: CategoryPublic[] }>('/api/categories');
  },
  locations() {
    return request<{ states: NigeriaState[] }>('/api/locations');
  },
  lgas(stateId: string) {
    return request<{ lgas: NigeriaLga[] }>(`/api/locations?stateId=${encodeURIComponent(stateId)}`);
  },
  deliveryQuote(stateCode: string | null, subtotalKobo: number) {
    return request<{ quote: DeliveryQuote }>(`/api/delivery/quote${qs({ stateCode: stateCode ?? '', subtotalKobo })}`);
  },
  paymentInfo() {
    return request<{ paymentMethod: string; accountNumber: string; accountName: string; bankName: string }>('/api/payment-info');
  },
  orders() {
    return request<{ orders: CustomerOrder[] }>('/api/orders');
  },
  tracking(orderId: string) {
    return request<{ order: CustomerOrder; events: Array<Record<string, unknown>>; shipments: Array<Record<string, unknown>> }>(`/api/orders/tracking?orderId=${encodeURIComponent(orderId)}`);
  },
  submitPayment(orderId: string, transferReference: string) {
    return request<{ order: { id: string; order_number: string; payment_status: string } }>('/api/orders/payment-submission', { method: 'POST', body: JSON.stringify({ orderId, transferReference }) });
  },
  placeOrder(payload: Json) {
    return request<{
      orders: CreatedOrder[];
      failures: Array<{ productId: string; error: string }>;
      totals: { subtotalKobo: number; deliveryKobo: number; totalKobo: number };
      delivery: { zoneName: string; etaMinDays: number; etaMaxDays: number };
      payment: { method: string; accountNumber: string; accountName: string; bankName: string };
    }>('/api/orders', { method: 'POST', body: JSON.stringify(payload) });
  },
  wishlist() {
    return request<{ items: Array<StorefrontProduct & { saved_at: string }> }>('/api/wishlist');
  },
  wishlistAdd(productId: string) {
    return request<{ ok: boolean }>('/api/wishlist', { method: 'POST', body: JSON.stringify({ productId }) });
  },
  wishlistRemove(productId: string) {
    return request<{ ok: boolean }>(`/api/wishlist?productId=${encodeURIComponent(productId)}`, { method: 'DELETE' });
  },
  notifications() {
    return request<{ notifications: Array<Record<string, unknown>>; unreadCount: number }>('/api/notifications');
  },
  notificationRead(notificationId: string) {
    return request<{ notification: Record<string, unknown> }>('/api/notifications', { method: 'PATCH', body: JSON.stringify({ notificationId }) });
  },
};
