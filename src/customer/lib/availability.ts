export type AvailabilityState = 'available' | 'low_stock' | 'limited' | 'out_of_stock' | 'coming_soon' | 'pre_order' | 'source_on_demand' | 'unknown';

export type Availability = {
  state: AvailabilityState;
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral' | 'brand';
  purchasable: boolean;
};

const LOW_STOCK_THRESHOLD = 8;
const LIMITED_STOCK_THRESHOLD = 3;

export function availabilityFor(stockStatus: string, variantAvailable?: number | null): Availability {
  if (typeof variantAvailable === 'number') {
    if (variantAvailable <= 0) return { state: 'out_of_stock', label: 'Out of stock', tone: 'danger', purchasable: false };
    if (variantAvailable <= LIMITED_STOCK_THRESHOLD) return { state: 'limited', label: `Only ${variantAvailable} left`, tone: 'warning', purchasable: true };
    if (variantAvailable <= LOW_STOCK_THRESHOLD) return { state: 'low_stock', label: 'Low stock', tone: 'warning', purchasable: true };
    return { state: 'available', label: 'Available', tone: 'success', purchasable: true };
  }
  switch ((stockStatus || '').toLowerCase()) {
    case 'available':
      return { state: 'available', label: 'Available', tone: 'success', purchasable: true };
    case 'low_stock':
      return { state: 'low_stock', label: 'Low stock', tone: 'warning', purchasable: true };
    case 'limited':
      return { state: 'limited', label: 'Limited availability', tone: 'warning', purchasable: true };
    case 'source_on_demand':
    case 'sourced_on_demand':
      return { state: 'source_on_demand', label: 'Available to source', tone: 'brand', purchasable: false };
    case 'coming_soon':
      return { state: 'coming_soon', label: 'Coming soon', tone: 'neutral', purchasable: false };
    case 'pre_order':
      return { state: 'pre_order', label: 'Pre-order', tone: 'brand', purchasable: true };
    case 'out_of_stock':
      return { state: 'out_of_stock', label: 'Out of stock', tone: 'danger', purchasable: false };
    default:
      return { state: 'unknown', label: 'Availability unknown', tone: 'neutral', purchasable: false };
  }
}

export function discountPercent(priceKobo: number, compareAtKobo?: number | null): number | null {
  if (!compareAtKobo || compareAtKobo <= priceKobo) return null;
  return Math.round(((compareAtKobo - priceKobo) / compareAtKobo) * 100);
}

export function etaDateRange(minDays: number, maxDays: number, from = new Date()): { from: Date; to: Date } {
  const from_ = new Date(from);
  from_.setDate(from_.getDate() + Math.max(0, minDays));
  const to = new Date(from);
  to.setDate(to.getDate() + Math.max(minDays, maxDays));
  return { from: from_, to };
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}
