import { apiUrl } from '@/lib/apiBase';
import { authHeaders } from '@/lib/session';
import type { NigeriaState } from '@/types';

export type SellerProfile = { shop_name: string; whatsapp: string; state_code: string; city: string; campus: string | null };
export type SellerListing = {
  id: string; title: string; description: string; category_id?: string | null; price_kobo: number;
  condition_label: string; quantity: number; images: string[]; status: string; created_at: string;
  seller_id?: string; shop_name?: string; whatsapp?: string; city?: string; state_code?: string;
  campus?: string | null; category_name?: string; seller_email?: string;
};
export type ListingInput = {
  title: string; description: string; priceKobo: number; condition: string;
  categoryId: string; quantity: number; images: string[]; shopName: string;
  whatsapp: string; stateCode: string; city: string; campus: string;
};
async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(apiUrl(path), {
    credentials: 'include', ...opts,
    headers: authHeaders({ 'Content-Type': 'application/json', ...opts.headers }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Unable to complete request.');
  return data as T;
}
export const sellerApi = {
  mine(page = 1) { return request<{ profile: SellerProfile | null; listings: SellerListing[]; total: number }>('/api/seller?page=' + page); },
  create(data: ListingInput) { return request<{ listing: SellerListing }>('/api/seller', { method: 'POST', body: JSON.stringify(data) }); },
  edit(id: string, data: ListingInput) { return request('/api/seller', { method: 'PATCH', body: JSON.stringify({ id, action: 'edit', ...data }) }); },
  change(id: string, action: 'pause' | 'resume') { return request('/api/seller', { method: 'PATCH', body: JSON.stringify({ id, action }) }); },
  remove(id: string) { return request('/api/seller', { method: 'DELETE', body: JSON.stringify({ id }) }); },
  states() { return request<{ states: NigeriaState[] }>('/api/locations'); },
  browse(query: { q?: string; state?: string; sellerId?: string; id?: string; page?: number } = {}) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => { if (value) params.set(key, String(value)); });
    return request<{ listings: SellerListing[]; total: number; page: number }>('/api/marketplace' + (params.size ? '?' + params.toString() : ''));
  },
  moderation() { return request<{ listings: SellerListing[] }>('/api/admin/seller-listings'); },
  review(id: string, status: 'approved' | 'rejected') {
    return request('/api/admin/seller-listings', { method: 'PATCH', body: JSON.stringify({ id, status }) });
  },
};
