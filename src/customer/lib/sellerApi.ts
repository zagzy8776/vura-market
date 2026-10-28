import { apiUrl } from '@/lib/apiBase';
import { authHeaders } from '@/lib/session';
import type { NigeriaState } from '@/types';

export type SellerProfile = { shop_name: string; whatsapp: string; state_code: string; city: string; campus: string | null };
export type SellerListing = {
  id: string; seller_id?: string; title: string; description: string; price_kobo: number;
  condition_label: string; quantity: number; images: string[]; status: string;
  category_id: string | null; created_at: string; shop_name?: string;
  state_code?: string; city?: string; campus?: string | null; whatsapp?: string;
  category_name?: string;
};
type Payload = Record<string, unknown>;

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    ...options,
    headers: authHeaders({ 'Content-Type': 'application/json', ...options.headers }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed. Please try again.');
  return data as T;
}
const jsonBody = (body: Payload) => JSON.stringify(body);
export const sellerApi = {
  mine(page = 1) {
    return req<{ profile: SellerProfile | null; listings: SellerListing[]; total: number; page: number }>('/api/seller?page=' + page);
  },
  one(id: string) { return req<{ profile: SellerProfile | null; listings: SellerListing[] }>('/api/seller?id=' + encodeURIComponent(id)); },
  post(data: Payload) { return req<{ listing: SellerListing }>('/api/seller', { method: 'POST', body: jsonBody(data) }); },
  edit(id: string, data: Payload) { return req('/api/seller', { method: 'PATCH', body: jsonBody({ ...data, action: 'edit', id }) }); },
  change(id: string, action: 'pause' | 'resume') { return req('/api/seller', { method: 'PATCH', body: jsonBody({ id, action }) }); },
  remove(id: string) { return req('/api/seller', { method: 'DELETE', body: jsonBody({ id }) }); },
  locations() { return req<{ states: NigeriaState[] }>('/api/locations'); },
  browse(query: { q?: string; state?: string; id?: string; sellerId?: string } = {}) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) qs.set(key, value);
    return req<{ listings: SellerListing[] }>('/api/marketplace' + (qs.size ? '?' + qs.toString() : ''));
  },
  reviewQueue() { return req<{ listings: SellerListing[] }>('/api/admin/seller-listings'); },
  review(id: string, status: 'approved' | 'rejected') { return req('/api/admin/seller-listings', { method: 'PATCH', body: jsonBody({ id, status }) }); },
};
