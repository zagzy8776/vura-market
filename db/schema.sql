CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'customer',
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_role_check CHECK (role IN ('customer', 'admin'))
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
  order_number text UNIQUE,
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
  transfer_reference text UNIQUE,
  payment_method text NOT NULL DEFAULT 'bank_transfer',
  payment_status text NOT NULL DEFAULT 'unpaid',
  paid_at timestamptz,
  payment_submitted_at timestamptz,
  payment_verified_at timestamptz,
  sourcing_status text NOT NULL DEFAULT 'awaiting_confirmation',
  purchased_at timestamptz,
  purchase_cost_kobo bigint,
  delivery_fee_kobo bigint NOT NULL DEFAULT 0,
  other_cost_kobo bigint NOT NULL DEFAULT 0,
  actual_profit_kobo bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orders_payment_method_check CHECK (payment_method = 'bank_transfer'),
  CONSTRAINT orders_payment_status_check CHECK (payment_status IN ('unpaid', 'pending_verification', 'paid', 'rejected')),
  CONSTRAINT orders_status_check CHECK (status IN ('awaiting_payment', 'payment_verification', 'confirmed', 'sourcing', 'purchased', 'out_for_delivery', 'delivered', 'cancelled')),
  CONSTRAINT orders_sourcing_status_check CHECK (sourcing_status IN ('awaiting_confirmation', 'confirmed', 'sourcing', 'purchased', 'out_for_delivery', 'delivered', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  recipient text NOT NULL,
  provider_id text,
  status text NOT NULL DEFAULT 'queued',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_deliveries_status_check CHECK (status IN ('queued', 'sent', 'failed'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  note text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account_claim_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
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
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications(user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS email_deliveries_order_event_idx ON email_deliveries(order_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_entity_idx ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_events_order_idx ON order_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_events_created_idx ON order_events(created_at DESC);
CREATE INDEX IF NOT EXISTS order_events_type_idx ON order_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS account_claim_tokens_user_idx ON account_claim_tokens(user_id, created_at DESC);
