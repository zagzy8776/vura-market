CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'customer',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  ip_address text
);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  icon text NOT NULL DEFAULT 'Package',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  phone text,
  notes text NOT NULL DEFAULT '',
  reliability_score numeric(3,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  name text NOT NULL,
  brand text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_kobo bigint NOT NULL CHECK (price_kobo > 0),
  condition_label text NOT NULL DEFAULT 'New',
  storage text,
  color text,
  stock_status text NOT NULL DEFAULT 'available',
  source_price_kobo bigint,
  source_location text,
  expected_cost_kobo bigint,
  verified_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  unit_price_kobo bigint NOT NULL,
  total_kobo bigint NOT NULL,
  delivery_name text NOT NULL,
  delivery_phone text NOT NULL,
  delivery_address text NOT NULL,
  delivery_city text NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_payment',
  payment_reference text UNIQUE,
  payment_method text NOT NULL DEFAULT 'bank_transfer',
  payment_status text NOT NULL DEFAULT 'unpaid',
  paid_at timestamptz,
  sourcing_status text NOT NULL DEFAULT 'awaiting_confirmation',
  purchased_at timestamptz,
  purchase_cost_kobo bigint,
  delivery_fee_kobo bigint NOT NULL DEFAULT 0,
  other_cost_kobo bigint NOT NULL DEFAULT 0,
  actual_profit_kobo bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO categories (name, slug, icon) VALUES
  ('Phones', 'phones', 'Smartphone'), ('Laptops', 'laptops', 'Laptop'),
  ('Audio', 'audio', 'Headphones'), ('Gaming', 'gaming', 'Gamepad2'),
  ('Accessories', 'accessories', 'Package'), ('Wearables', 'wearables', 'Watch')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO platform_settings (key, value) VALUES
  ('payout_account_number', '4600544947'),
  ('payout_account_name', 'Vura Tech Hub'),
  ('payout_bank_name', 'VFD Microfinance Bank'),
  ('payment_method', 'bank_transfer')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS products_seller_idx ON products(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS products_category_idx ON products(category_id, created_at DESC);
CREATE INDEX IF NOT EXISTS products_active_created_idx ON products(is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS products_stock_idx ON products(stock_status, is_active);
CREATE INDEX IF NOT EXISTS products_supplier_idx ON products(supplier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS product_images_product_idx ON product_images(product_id, sort_order);
CREATE INDEX IF NOT EXISTS orders_buyer_created_idx ON orders(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_created_idx ON orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON orders(payment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_sourcing_status_idx ON orders(sourcing_status, created_at DESC);
CREATE INDEX IF NOT EXISTS suppliers_name_idx ON suppliers(name);
