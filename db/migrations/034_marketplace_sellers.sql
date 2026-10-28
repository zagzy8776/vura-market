-- Independent community listings. Seller accounts remain ordinary customers;
-- this table never grants Studio permissions or feeds the Vura checkout ledger.
CREATE TABLE IF NOT EXISTS marketplace_sellers (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  shop_name varchar(100) NOT NULL,
  whatsapp varchar(20) NOT NULL,
  state_code varchar(2) NOT NULL,
  city varchar(100) NOT NULL,
  campus varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES marketplace_sellers(user_id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  title varchar(150) NOT NULL,
  description text NOT NULL DEFAULT '',
  price_kobo bigint NOT NULL CHECK (price_kobo > 0),
  condition_label varchar(32) NOT NULL DEFAULT 'New',
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 0 AND 100000),
  images text[] NOT NULL,
  status varchar(12) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'paused', 'removed')),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(images) BETWEEN 1 AND 8)
);
CREATE INDEX IF NOT EXISTS marketplace_listings_seller_idx
  ON marketplace_listings(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_listings_public_idx
  ON marketplace_listings(created_at DESC) WHERE status = 'approved' AND quantity > 0;
CREATE INDEX IF NOT EXISTS marketplace_listings_review_idx
  ON marketplace_listings(status, created_at DESC);
