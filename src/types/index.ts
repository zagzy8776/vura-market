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
  category?: string;
  category_id?: string;
  description: string;
  price_kobo: number;
  condition_label: string;
  storage?: string | null;
  color?: string | null;
  stock_status: string;
  images: string[];
  // admin-only fields (never sent to public responses)
  source_price_kobo?: number | null;
  expected_cost_kobo?: number | null;
  supplier_name?: string | null;
  is_active?: boolean;
  verified_at?: string | null;
};

export type Order = {
  id: string;
  order_number?: string;
  quantity: number;
  total_kobo: number;
  status: string;
  payment_status: string;
  sourcing_status?: string;
  delivery_name: string;
  delivery_phone: string;
  delivery_address: string;
  delivery_city: string;
  created_at: string;
  product_name: string;
  brand: string;
  images: string[];
  transfer_reference?: string | null;
  // admin
  buyer_email?: string;
  supplier_name?: string | null;
  purchase_cost_kobo?: number | null;
  delivery_fee_kobo?: number | null;
  other_cost_kobo?: number | null;
  actual_profit_kobo?: number | null;
  payment_submitted_at?: string | null;
  payment_verified_at?: string | null;
};

export type Supplier = {
  id: string;
  name: string;
  location?: string | null;
  phone?: string | null;
  notes?: string;
  reliability_score?: number | null;
  created_at?: string;
};

export type Customer = {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
  order_count: number;
  total_spend_kobo: number;
};

export type Notification = {
  id: string;
  user_id: string;
  order_id?: string | null;
  type: string;
  title: string;
  body: string;
  read_at?: string | null;
  created_at: string;
  user_email?: string;
  order_number?: string;
};

export type Audit = {
  id: string;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  before_data?: unknown;
  after_data?: unknown;
  metadata?: unknown;
  created_at: string;
  actor_user_id?: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
};

export type OrderEvent = {
  id: string;
  order_id: string;
  event_type: string;
  from_status?: string | null;
  to_status?: string | null;
  note?: string | null;
  metadata?: unknown;
  created_at: string;
  actor_user_id?: string | null;
  actor_name?: string | null;
  order_number?: string;
};

export type Overview = {
  liveProducts: number;
  monthlyOrders: number;
  monthlyRevenueKobo: number;
  monthlyProfitKobo: number;
  customers?: Customer[];
  notifications?: Notification[];
  audit?: Audit[];
  orderEvents?: OrderEvent[];
};

export type View = 'home' | 'catalog' | 'deals' | 'product' | 'orders' | 'account' | 'studio';
export type AuthMode = 'signin' | 'signup';

// Tabs that the live Studio actually loads data for.
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
  | 'opportunities'
  | 'finance'
  | 'analytics'
  | 'audit'
  | 'settings';

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: 'customer' | 'admin';
};

// Resource loading state for independent resource loading
export type ResourceState<T> = 
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'success'; data: T }
  | { state: 'error'; error: string; requestId?: string };
