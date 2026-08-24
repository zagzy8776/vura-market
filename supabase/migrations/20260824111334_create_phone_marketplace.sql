/*
# Create phone marketplace

1. Purpose
- Replaces the services catalog with a curated phone and accessories marketplace foundation.
- Supports fast seller listings, public product browsing, and delivery-ready orders.

2. New tables and columns
- `products`
  - `id`: product identifier.
  - `owner_id`: signed-in seller who created the listing, nullable for starter catalog items.
  - `name`, `brand`, `category`, `description`: product details.
  - `price_kobo`: listed selling price stored as whole kobo.
  - `stock_status`: available, reserved, or sold_out.
  - `condition_label`: new, UK used, or refurbished.
  - `storage`, `color`: product attributes.
  - `image_url`: product image URL.
  - `is_featured`, `is_active`: storefront visibility.
  - `created_at`, `updated_at`: timestamps.
- `orders`
  - `id`: order identifier.
  - `order_number`: customer-facing reference.
  - `buyer_id`: signed-in customer.
  - `product_id`: selected product.
  - `quantity`: requested quantity.
  - `unit_price_kobo`, `total_kobo`: server-calculated purchase values.
  - `status`: awaiting_payment, paid, processing, delivered, cancelled.
  - `delivery_name`, `delivery_phone`, `delivery_address`, `delivery_city`: fulfillment details.
  - `created_at`, `updated_at`: timestamps.

3. Security
- Anonymous visitors can read only active products.
- Sellers can create and manage only their own listings.
- Customers can read only their own orders.
- Order creation runs through a server-side function that looks up the product price, validates quantity and stock, and calculates the total.
- Browser clients cannot directly insert or alter orders.

4. Important notes
- Payment provider integration is intentionally left for the next phase; orders begin as awaiting payment.
- Product image URLs are starter content and can later be replaced by a private storage upload flow.
- All money is stored in kobo to avoid rounding errors.
*/

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL,
  brand text NOT NULL,
  category text NOT NULL DEFAULT 'Phones',
  description text NOT NULL DEFAULT '',
  price_kobo bigint NOT NULL CHECK (price_kobo > 0),
  stock_status text NOT NULL DEFAULT 'available' CHECK (stock_status IN ('available', 'reserved', 'sold_out')),
  condition_label text NOT NULL DEFAULT 'New',
  storage text,
  color text,
  image_url text NOT NULL,
  is_featured boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE DEFAULT ('APL-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  buyer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  unit_price_kobo bigint NOT NULL CHECK (unit_price_kobo > 0),
  total_kobo bigint NOT NULL CHECK (total_kobo > 0),
  status text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment', 'paid', 'processing', 'delivered', 'cancelled')),
  delivery_name text NOT NULL,
  delivery_phone text NOT NULL,
  delivery_address text NOT NULL,
  delivery_city text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_active_featured_idx ON public.products (is_active, is_featured, created_at DESC);
CREATE INDEX IF NOT EXISTS products_owner_idx ON public.products (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_buyer_idx ON public.orders (buyer_id, created_at DESC);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

REVOKE INSERT, UPDATE, DELETE ON public.products FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM anon, authenticated;
REVOKE UPDATE ON public.orders FROM authenticated;
GRANT SELECT ON public.products TO anon, authenticated;
GRANT SELECT ON public.orders TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;

DROP POLICY IF EXISTS "products_select_active" ON public.products;
CREATE POLICY "products_select_active" ON public.products FOR SELECT TO anon, authenticated USING (is_active = true OR auth.uid() = owner_id);
DROP POLICY IF EXISTS "products_insert_own" ON public.products;
CREATE POLICY "products_insert_own" ON public.products FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "products_update_own" ON public.products;
CREATE POLICY "products_update_own" ON public.products FOR UPDATE TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "products_delete_own" ON public.products;
CREATE POLICY "products_delete_own" ON public.products FOR DELETE TO authenticated USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "orders_select_own" ON public.orders;
CREATE POLICY "orders_select_own" ON public.orders FOR SELECT TO authenticated USING (auth.uid() = buyer_id);
DROP POLICY IF EXISTS "orders_insert_own" ON public.orders;
CREATE POLICY "orders_insert_own" ON public.orders FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "orders_update_own" ON public.orders;
CREATE POLICY "orders_update_own" ON public.orders FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "orders_delete_own" ON public.orders;
CREATE POLICY "orders_delete_own" ON public.orders FOR DELETE TO authenticated USING (false);

CREATE OR REPLACE FUNCTION public.create_marketplace_order(
  p_product_id uuid,
  p_quantity integer,
  p_delivery_name text,
  p_delivery_phone text,
  p_delivery_address text,
  p_delivery_city text
)
RETURNS TABLE (id uuid, order_number text, total_kobo bigint)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_order public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 10 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
  IF length(trim(p_delivery_name)) < 2 OR length(trim(p_delivery_phone)) < 7 OR length(trim(p_delivery_address)) < 5 OR length(trim(p_delivery_city)) < 2 THEN RAISE EXCEPTION 'Invalid delivery details'; END IF;

  SELECT * INTO v_product FROM public.products WHERE products.id = p_product_id AND products.is_active = true FOR UPDATE;
  IF NOT FOUND OR v_product.stock_status <> 'available' THEN RAISE EXCEPTION 'Product unavailable'; END IF;

  INSERT INTO public.orders (buyer_id, product_id, quantity, unit_price_kobo, total_kobo, delivery_name, delivery_phone, delivery_address, delivery_city)
  VALUES (auth.uid(), v_product.id, p_quantity, v_product.price_kobo, v_product.price_kobo * p_quantity, trim(p_delivery_name), trim(p_delivery_phone), trim(p_delivery_address), trim(p_delivery_city))
  RETURNING orders.id, orders.order_number, orders.total_kobo INTO v_order;

  RETURN QUERY SELECT v_order.id, v_order.order_number, v_order.total_kobo;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_marketplace_order(uuid, integer, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order(uuid, integer, text, text, text, text) TO authenticated;

INSERT INTO public.products (name, brand, category, description, price_kobo, condition_label, storage, color, image_url, is_featured)
VALUES
  ('iPhone 15 Pro', 'Apple', 'Phones', 'Titanium design with a pro camera system and all-day battery.', 110000000, 'New', '256GB', 'Natural Titanium', 'https://images.pexels.com/photos/14979013/pexels-photo-14979013.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', true),
  ('Galaxy S24 Ultra', 'Samsung', 'Phones', 'The ultimate Galaxy with a bright display and built-in S Pen.', 98000000, 'New', '256GB', 'Titanium Gray', 'https://images.pexels.com/photos/9956763/pexels-photo-9956763.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', true),
  ('iPhone 13', 'Apple', 'Phones', 'A reliable everyday iPhone with a beautiful OLED display.', 64500000, 'UK Used', '128GB', 'Midnight', 'https://images.pexels.com/photos/7989741/pexels-photo-7989741.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', true),
  ('Pixel 8 Pro', 'Google', 'Phones', 'Intelligent photography and a clean Android experience.', 73500000, 'New', '128GB', 'Bay Blue', 'https://images.pexels.com/photos/27212302/pexels-photo-27212302.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', false),
  ('iPhone 14 Pro Max', 'Apple', 'Phones', 'Big screen, serious battery life, and a powerful pro camera.', 89500000, 'UK Used', '256GB', 'Deep Purple', 'https://images.pexels.com/photos/29765810/pexels-photo-29765810.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', false),
  ('Galaxy Buds Pro', 'Samsung', 'Accessories', 'Premium wireless audio that fits right into your everyday.', 8500000, 'New', null, 'Black', 'https://images.pexels.com/photos/9956763/pexels-photo-9956763.jpeg?auto=compress&cs=tinysrgb&h=650&w=940', false)
ON CONFLICT DO NOTHING;
