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

export type View = 'home' | 'catalog' | 'deals' | 'product' | 'orders' | 'account' | 'studio';
export type AuthMode = 'signin' | 'signup';
export type StudioTab = 'overview' | 'orders' | 'products' | 'suppliers' | 'settings';

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: 'customer' | 'admin';
};
