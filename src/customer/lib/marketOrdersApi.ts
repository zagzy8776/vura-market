import { apiUrl } from '@/lib/apiBase';
import { authHeaders } from '@/lib/session';

export type MarketplaceOrder = {
 id: string; order_number: string; listing_id: string; listing_title: string;
 quantity: number; unit_price_kobo: number; subtotal_kobo: number; buyer_phone: string;
 destination_state_code: string; destination_city: string;
 status: 'awaiting_seller' | 'seller_accepted' | 'declined' | 'cancelled' | 'expired';
 created_at: string; responded_at?: string | null; seller_response_deadline: string;
 images: string[]; shop_name: string; buyer_name: string;
};
export type MarketplaceEvent = {event_type: string; message: string; created_at: string};
async function request<T>(query = '', init: RequestInit = {}) {
 const r = await fetch(apiUrl('/api/market-orders' + query), {
   credentials: 'include', ...init,
   headers: authHeaders({ 'Content-Type': 'application/json', ...init.headers }),
 });
 const data = await r.json().catch(() => ({}));
 if (!r.ok) throw new Error(data.error || 'Could not load your request.');
 return data as T;
}
export const marketOrdersApi = {
 list(side: 'buyer'|'seller', page = 1) {
   return request<{orders:MarketplaceOrder[];events:MarketplaceEvent[]}>('?side=' + side + '&page=' + page);
 },
 detail(id: string) {
   return request<{orders:MarketplaceOrder[];events:MarketplaceEvent[]}>('?id=' + encodeURIComponent(id));
 },
 create(payload: { listingId: string; requestId: string; quantity: number; phone: string; stateCode: string; city: string }) {
   return request<{order:MarketplaceOrder}>('', {method:'POST', body:JSON.stringify(payload)});
 },
 respond(id: string, action: 'accept'|'decline'|'unavailable'|'cancel') {
   return request<{order:MarketplaceOrder}>('', {method:'PATCH', body:JSON.stringify({id,action})});
 },
};
