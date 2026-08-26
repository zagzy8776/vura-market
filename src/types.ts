export type ProductVariantPublic = {
  id: string;
  sku: string;
  name: string;
  attributes: Record<string, string>;
  price_kobo: number;
  available_quantity: number;
  reserved_quantity: number;
};

export type StorefrontProduct = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  description?: string | null;
  price_kobo: number;
  compare_at_price_kobo?: number | null;
  stock_status: string;
  condition_label?: string | null;
  storage?: string | null;
  color?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  category_slug?: string | null;
  specifications?: Record<string, unknown> | null;
  images?: string[];
  variants?: ProductVariantPublic[];
  saved_at?: string;
};

export type CategoryPublic = {
  id: string;
  name: string;
  slug: string;
  icon?: string | null;
  product_count?: number;
};

export type NigeriaState = {
  id: string;
  name: string;
  code: string;
};

export type NigeriaLga = {
  id: string;
  name: string;
};

export type DeliveryQuote = {
  stateCode: string | null;
  stateName: string | null;
  zoneName: string;
  feeKobo: number;
  etaMinDays: number;
  etaMaxDays: number;
};

export type CustomerOrder = {
  id: string;
  order_number: string;
  quantity: number;
  total_kobo: number;
  status: string;
  payment_method?: string | null;
  payment_status: string;
  transfer_reference?: string | null;
  payment_submitted_at?: string | null;
  payment_verified_at?: string | null;
  sourcing_status?: string | null;
  delivery_name?: string | null;
  delivery_phone?: string | null;
  delivery_address?: string | null;
  delivery_city?: string | null;
  delivery_fee_kobo?: number | null;
  created_at: string;
  updated_at?: string | null;
  product_name?: string | null;
  brand?: string | null;
  images?: Array<string | null>;
};

export type CreatedOrder = {
  id: string;
  order_number: string;
  total_kobo: number;
  payment_method?: string | null;
  payment_status?: string | null;
  variant_id?: string | null;
  reservation_id?: string | null;
};

export type TrackingEvent = {
  id: string | number;
  status: string;
  message?: string | null;
  location?: string | null;
  tracking_number?: string | null;
  source?: string | null;
  created_at: string;
};

export type ShipmentEvent = {
  id: string | number;
  status: string;
  message?: string | null;
  location?: string | null;
  createdAt: string;
};

export type Shipment = {
  id: string;
  status: string;
  supplier_name?: string | null;
  tracking_number?: string | null;
  courier_name?: string | null;
  events?: ShipmentEvent[];
};

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type View = 'home' | 'catalog' | 'deals' | 'product';

export type Category = {
  id: string;
  name: string;
  slug: string;
  icon: string;
};

export type Product = {
  id: string;
  name: string;
  brand: string;
  description?: string | null;
  price_kobo: number;
  condition_label: string;
  storage?: string | null;
  color?: string | null;
  stock_status: string;
  category_id?: string | null;
  category?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  source_price_kobo?: number | null;
  source_location?: string | null;
  expected_cost_kobo?: number | null;
  is_active?: boolean;
  verified_at?: string | null;
  created_at?: string;
  images?: string[];
};

export type Order = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  sourcing_status?: string | null;
  total_kobo: number;
  quantity?: number;
  product_name?: string | null;
  brand?: string | null;
  buyer_email?: string | null;
  buyer_name?: string | null;
  delivery_name?: string | null;
  delivery_phone?: string | null;
  delivery_address?: string | null;
  delivery_city?: string | null;
  delivery_fee_kobo?: number | null;
  purchase_cost_kobo?: number | null;
  other_cost_kobo?: number | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  created_at?: string;
  updated_at?: string | null;
};

export type Supplier = {
  id: string;
  name: string;
  location?: string | null;
  phone?: string | null;
  notes?: string | null;
  pending_orders?: number;
  rejected_orders?: number;
  reliability_score?: number | null;
  revenue_kobo?: number | null;
  profit_kobo?: number | null;
  purchase_cost_kobo?: number | null;
  delivery_cost_kobo?: number | null;
  other_cost_kobo?: number | null;
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  order_count?: number;
  total_spend_kobo?: number | null;
};

export type Notification = {
  id: string | number;
  title: string;
  body?: string | null;
  user_email?: string | null;
  order_number?: string | null;
  event_type?: string | null;
  created_at: string;
};

export type Audit = {
  id: string | number;
  actor_name?: string | null;
  actor_email?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  created_at: string;
};

export type OrderEvent = {
  id: string | number;
  event_type: string;
  actor_name?: string | null;
  order_id?: string | null;
  order_number?: string | null;
  created_at: string;
};

export type OverviewAttention = {
  pendingPayment: number;
  toFulfill: number;
  lowStock: number;
};

export type OverviewRecentOrder = {
  id: string;
  order_number: string;
  total_kobo: number;
  status: string;
  payment_status: string;
  created_at: string;
  delivery_name?: string | null;
  product_name?: string | null;
};

export type Overview = {
  liveProducts: number;
  monthlyOrders: number;
  monthlyRevenueKobo: number;
  monthlyProfitKobo: number;
  attention?: OverviewAttention;
  recentOrders?: OverviewRecentOrder[];
  customers?: Customer[];
  audit?: Audit[];
  orderEvents?: OrderEvent[];
};

export type StudioTab =
  | 'overview'
  | 'orders'
  | 'payments'
  | 'products'
  | 'sourcing'
  | 'suppliers'
  | 'customers'
  | 'notifications'
  | 'audit';
