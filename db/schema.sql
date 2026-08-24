CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  icon text NOT NULL DEFAULT 'Package',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  brand text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_kobo bigint NOT NULL CHECK (price_kobo > 0),
  condition_label text NOT NULL DEFAULT 'New',
  storage text,
  color text,
  stock_status text NOT NULL DEFAULT 'available',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
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
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  unit_price_kobo bigint NOT NULL,
  total_kobo bigint NOT NULL,
  delivery_name text NOT NULL,
  delivery_phone text NOT NULL,
  delivery_address text NOT NULL,
  delivery_city text NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_payment',
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO categories (name, slug, icon) VALUES
  ('Phones', 'phones', 'Smartphone'), ('Laptops', 'laptops', 'Laptop'),
  ('Audio', 'audio', 'Headphones'), ('Gaming', 'gaming', 'Gamepad2'),
  ('Accessories', 'accessories', 'Package'), ('Wearables', 'wearables', 'Watch')
ON CONFLICT (slug) DO NOTHING;

CREATE INDEX IF NOT EXISTS products_seller_idx ON products(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS products_category_idx ON products(category_id, created_at DESC);
CREATE INDEX IF NOT EXISTS product_images_product_idx ON product_images(product_id, sort_order);
