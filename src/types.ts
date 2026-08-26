export type MoneyKobo = number;

export type ResourceState<T> =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'success'; data: T; requestId?: string }
  | { state: 'error'; error: string; requestId?: string };

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: 'customer' | 'admin';
};

export type Category = {
  id: string;
  name: string;
  slug?: string | null;
  icon?: string | null;
};

export type Product = {
  id: string;
  name: string;
  brand?: string | null;
  description?: string | null;
  price_kobo: number;
  condition_label?: string | null;
  storage?: string | null;
  color?: string | null;
  stock_status?: string | null;
  is_active?: boolean | null;
  source_price_kobo?: number | null;
  source_location?: string | null;
  expected_cost_kobo?: number | null;
  verified_at?: string | null;
  category_id?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  category?: string | null;
  images?: string[] | null;
  created_at?: string;
};

export type Supplier = {
  id: string;
  name: string;
  location?: string | null;
  phone?: string | null;
  notes?: string | null;
  reliability_score?: number | null;
  created_at?: string;
  updated_at?: string;
};

export type Order = {
  id: string;
  order_number: string;
  quantity?: number;
  total_kobo: number;
  status: string;
  payment_status: string;
  payment_method?: string | null;
  transfer_reference?: string | null;
  payment_submitted_at?: string | null;
  payment_verified_at?: string | null;
  sourcing_status?: string | null;
  delivery_name?: string | null;
  delivery_phone?: string | null;
  delivery_address?: string | null;
  delivery_city?: string | null;
  purchase_cost_kobo?: number | null;
  delivery_fee_kobo?: number | null;
  other_cost_kobo?: number | null;
  actual_profit_kobo?: number | null;
  product_name?: string | null;
  brand?: string | null;
  supplier_name?: string | null;
  supplier_id?: string | null;
  buyer_email?: string | null;
  created_at?: string;
  images?: string[] | null;
};

export type CustomerOrder = {
  id: string;
  order_number: string;
  total_kobo: number;
  status: string;
  payment_status: string;
  created_at: string;
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
  | 'health'
  | 'orders'
  | 'payments'
  | 'products'
  | 'inventory'
  | 'sourcing'
  | 'suppliers'
  | 'delivery'
  | 'customers'
  | 'notifications'
  | 'finance'
  | 'analytics'
  | 'audit'
  | 'settings';

export type View = 'home' | 'catalog' | 'deals' | 'product';
