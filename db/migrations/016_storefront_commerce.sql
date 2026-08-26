BEGIN;

-- Storefront commerce foundations. Additive only: existing Studio and bank
-- transfer checkout keep working unchanged.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- Products: SEO slugs, discount reference price, tags, specifications, views
-- ---------------------------------------------------------------------------
ALTER TABLE products ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS compare_at_price_kobo bigint CHECK (compare_at_price_kobo IS NULL OR compare_at_price_kobo > 0);
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS specifications jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

UPDATE products
   SET slug = regexp_replace(lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g')), '(^-+|-+$)', '')
 WHERE slug IS NULL;

UPDATE products p
   SET slug = left(p.slug, 180) || '-' || substr(replace(p.id::text, '-', ''), 1, 6)
 WHERE EXISTS (SELECT 1 FROM products q WHERE q.slug = p.slug AND q.id <> p.id);

CREATE UNIQUE INDEX IF NOT EXISTS products_slug_uidx ON products(slug);

CREATE OR REPLACE FUNCTION ensure_product_slug() RETURNS trigger AS $$
DECLARE
  base text;
  candidate text;
  n integer := 0;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    base := regexp_replace(lower(regexp_replace(NEW.name, '[^a-zA-Z0-9]+', '-', 'g')), '(^-+|-+$)', '');
    candidate := base;
    WHILE EXISTS (SELECT 1 FROM products WHERE slug = candidate AND id <> NEW.id) LOOP
      n := n + 1;
      candidate := base || '-' || n::text;
    END LOOP;
    NEW.slug := candidate;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS products_slug_trigger ON products;
CREATE TRIGGER products_slug_trigger BEFORE INSERT OR UPDATE OF name, slug ON products FOR EACH ROW EXECUTE FUNCTION ensure_product_slug();

CREATE INDEX IF NOT EXISTS products_search_trgm_idx ON products USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS products_tags_idx ON products USING GIN (tags);
CREATE INDEX IF NOT EXISTS products_compare_at_idx ON products (compare_at_price_kobo) WHERE compare_at_price_kobo IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_view_count_idx ON products (view_count DESC);

-- ---------------------------------------------------------------------------
-- Structured delivery address on orders + delivery zones and server quotes
-- ---------------------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_state text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_lga text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_area text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_street text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_landmark text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_instructions text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_whatsapp text;

CREATE TABLE IF NOT EXISTS delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  state_codes text[],
  fee_kobo bigint NOT NULL CHECK (fee_kobo >= 0),
  eta_min_days integer NOT NULL DEFAULT 2 CHECK (eta_min_days >= 0),
  eta_max_days integer NOT NULL DEFAULT 5 CHECK (eta_max_days >= eta_min_days),
  free_delivery_min_kobo bigint CHECK (free_delivery_min_kobo IS NULL OR free_delivery_min_kobo > 0),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_zones_name_uidx ON delivery_zones(name);

INSERT INTO delivery_zones (name, state_codes, fee_kobo, eta_min_days, eta_max_days, sort_order) VALUES
  ('Lagos', ARRAY['LA'], 350000, 2, 3, 10),
  ('Abuja FCT', ARRAY['FC'], 450000, 3, 5, 20),
  ('Nationwide', NULL, 550000, 4, 7, 100)
ON CONFLICT (name) DO UPDATE SET state_codes = EXCLUDED.state_codes, fee_kobo = EXCLUDED.fee_kobo,
  eta_min_days = EXCLUDED.eta_min_days, eta_max_days = EXCLUDED.eta_max_days, updated_at = now();

-- Specific zones match only their listed states; zones with empty/null state
-- lists are the nationwide fallback.
CREATE OR REPLACE FUNCTION quote_delivery(
  p_state_code text,
  p_subtotal_kobo bigint
) RETURNS TABLE (
  fee_kobo bigint,
  eta_min_days integer,
  eta_max_days integer,
  zone_name text
) AS $$
DECLARE
  v_row record;
BEGIN
  SELECT z.fee_kobo, z.eta_min_days, z.eta_max_days, z.name, z.free_delivery_min_kobo
    INTO v_row
    FROM delivery_zones z
   WHERE z.is_active
     AND (
       (p_state_code IS NOT NULL AND p_state_code = ANY (COALESCE(z.state_codes, '{}'::text[])))
       OR COALESCE(array_length(z.state_codes, 1), 0) = 0
     )
   ORDER BY
     CASE WHEN p_state_code IS NOT NULL AND p_state_code = ANY (COALESCE(z.state_codes, '{}'::text[])) THEN 0 ELSE 1 END,
     z.sort_order
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT
    CASE
      WHEN v_row.free_delivery_min_kobo IS NOT NULL AND p_subtotal_kobo >= v_row.free_delivery_min_kobo THEN 0::bigint
      ELSE v_row.fee_kobo
    END,
    v_row.eta_min_days,
    v_row.eta_max_days,
    v_row.name;
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------
-- Order creation v2: structured address + authoritative delivery fee in the
-- same atomic transaction as inventory reservation.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_order_v2(
  p_buyer_id uuid,
  p_product_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_delivery_name text,
  p_delivery_phone text,
  p_address jsonb,
  p_whatsapp text DEFAULT NULL
) RETURNS TABLE (
  id uuid,
  order_number text,
  unit_price_kobo bigint,
  subtotal_kobo bigint,
  delivery_fee_kobo bigint,
  total_kobo bigint,
  payment_method text,
  payment_status text,
  variant_id uuid,
  reservation_id uuid,
  zone_name text,
  eta_min_days integer,
  eta_max_days integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_price bigint;
  v_variant_count integer;
  v_order_id uuid;
  v_reservation_id uuid;
  v_state_code text;
  v_quote record;
  v_subtotal bigint;
  v_area text;
  v_street text;
  v_landmark text;
BEGIN
  IF p_quantity < 1 OR p_quantity > 10 THEN
    RAISE EXCEPTION 'Invalid order quantity';
  END IF;

  IF p_address->>'stateCode' IS NOT NULL AND length(p_address->>'stateCode') > 4 THEN
    RAISE EXCEPTION 'Invalid delivery state';
  END IF;

  SELECT price_kobo INTO v_price
    FROM products
   WHERE products.id = p_product_id
     AND products.is_active = true
     AND products.stock_status = 'available';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That product is no longer available';
  END IF;

  SELECT count(*)::integer INTO v_variant_count
    FROM product_variants
   WHERE product_variants.product_id = p_product_id
     AND product_variants.is_active = true;

  IF v_variant_count > 0 AND p_variant_id IS NULL THEN
    RAISE EXCEPTION 'A product variant is required';
  END IF;

  IF p_variant_id IS NOT NULL THEN
    PERFORM 1
      FROM product_variants
     WHERE product_variants.id = p_variant_id
       AND product_variants.product_id = p_product_id
       AND product_variants.is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid product variant';
    END IF;
  END IF;

  v_state_code := NULLIF(lower(trim(p_address->>'stateCode')), '');
  v_subtotal := v_price * p_quantity;

  SELECT q.fee_kobo, q.eta_min_days, q.eta_max_days, q.zone_name
    INTO v_quote
    FROM quote_delivery(v_state_code, v_subtotal) q;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'We do not deliver to that state yet';
  END IF;

  v_area := NULLIF(trim(COALESCE(p_address->>'area', '')), '');
  v_street := NULLIF(trim(COALESCE(p_address->>'street', '')), '');
  v_landmark := NULLIF(trim(COALESCE(p_address->>'landmark', '')), '');

  INSERT INTO orders (
    buyer_id, product_id, quantity, unit_price_kobo, total_kobo,
    delivery_name, delivery_phone, delivery_address, delivery_city,
    delivery_state, delivery_lga, delivery_area, delivery_street,
    delivery_landmark, delivery_instructions,
    customer_whatsapp,
    delivery_fee_kobo, payment_method
  ) VALUES (
    p_buyer_id, p_product_id, p_quantity, v_price, v_subtotal + v_quote.fee_kobo,
    p_delivery_name, p_delivery_phone,
    COALESCE(concat_ws(', ', v_area, v_street, v_landmark), 'Address provided at dispatch'),
    COALESCE(NULLIF(trim(COALESCE(p_address->>'city', '')), ''), v_area, '—'),
    NULLIF(trim(COALESCE(p_address->>'stateName', '')), ''),
    NULLIF(trim(COALESCE(p_address->>'lga', '')), ''),
    v_area, v_street, v_landmark,
    NULLIF(trim(COALESCE(p_address->>'instructions', '')), ''),
    NULLIF(trim(COALESCE(p_whatsapp, '')), ''),
    v_quote.fee_kobo, 'bank_transfer'
  )
  RETURNING orders.id INTO v_order_id;

  IF p_variant_id IS NOT NULL THEN
    v_reservation_id := reserve_inventory(
      p_variant_id, v_order_id, p_quantity, p_buyer_id, now() + interval '30 minutes'
    );
  END IF;

  UPDATE orders
     SET order_number = 'VURA-' || UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 10))
   WHERE orders.id = v_order_id;

  RETURN QUERY
  SELECT o.id, o.order_number, o.unit_price_kobo, v_subtotal, v_quote.fee_kobo,
         o.total_kobo, o.payment_method, o.payment_status,
         p_variant_id, v_reservation_id, v_quote.zone_name, v_quote.eta_min_days, v_quote.eta_max_days
    FROM orders o
   WHERE o.id = v_order_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Wishlist
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wishlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wishlist_items_user_product_uidx ON wishlist_items(user_id, product_id);
CREATE INDEX IF NOT EXISTS wishlist_items_user_created_idx ON wishlist_items(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Lightweight first-party analytics for the storefront funnel
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id text,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  path text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_type_created_idx ON analytics_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_session_idx ON analytics_events(session_id, created_at DESC);

COMMIT;
