-- Marketplace order-request foundation. No payment or courier reference is invented here.
-- Separate tables keep community seller fulfillment away from Vura-managed orders.
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx ON users(phone) WHERE phone IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS marketplace_order_reference_seq;

CREATE TABLE IF NOT EXISTS marketplace_purchase_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_number text NOT NULL UNIQUE,
 request_key uuid NOT NULL,
 buyer_id uuid NOT NULL REFERENCES users(id),
 seller_id uuid NOT NULL REFERENCES users(id),
 listing_id uuid NOT NULL REFERENCES marketplace_listings(id),
 listing_title text NOT NULL,
 quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 1000),
 unit_price_kobo bigint NOT NULL CHECK (unit_price_kobo > 0),
 subtotal_kobo bigint NOT NULL CHECK (subtotal_kobo > 0),
 buyer_phone text NOT NULL,
 destination_state_code varchar(2) NOT NULL,
 destination_city varchar(100) NOT NULL,
 status text NOT NULL DEFAULT 'awaiting_seller'
   CHECK (status IN ('awaiting_seller', 'seller_accepted', 'declined', 'cancelled', 'expired')),
 seller_response_deadline timestamptz NOT NULL DEFAULT (now() + interval '6 hours'),
 responded_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT marketplace_request_different_users CHECK (buyer_id <> seller_id),
 CONSTRAINT marketplace_request_dedupe UNIQUE (buyer_id, request_key)
);
CREATE INDEX IF NOT EXISTS marketplace_request_buyer_idx ON marketplace_purchase_requests(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_request_seller_idx ON marketplace_purchase_requests(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_request_expiring_idx
 ON marketplace_purchase_requests(seller_response_deadline)
 WHERE status = 'awaiting_seller';

CREATE TABLE IF NOT EXISTS marketplace_order_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 request_id uuid NOT NULL REFERENCES marketplace_purchase_requests(id) ON DELETE CASCADE,
 actor_id uuid REFERENCES users(id),
 event_type text NOT NULL,
 message text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_order_events_req_idx ON marketplace_order_events(request_id, created_at);

-- Seller pickup details are private and never included in public listing queries.
CREATE TABLE IF NOT EXISTS marketplace_seller_dispatch_profiles (
 seller_id uuid PRIMARY KEY REFERENCES marketplace_sellers(user_id) ON DELETE CASCADE,
 pickup_contact_name text NOT NULL,
 pickup_contact_phone text NOT NULL,
 pickup_address text NOT NULL,
 pickup_city text NOT NULL,
 pickup_state_code varchar(2) NOT NULL,
 verified_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);

-- Integration-owned shipping details: tracking data must be written only by
-- verified server-side carrier bookings or authenticated courier webhooks.
CREATE TABLE IF NOT EXISTS marketplace_shipments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL UNIQUE REFERENCES marketplace_purchase_requests(id),
 provider_name text NOT NULL,
 provider_shipment_id text NOT NULL,
 tracking_number text,
 tracking_url text,
 current_status text NOT NULL DEFAULT 'booking_requested',
 carrier_event_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider_name, provider_shipment_id)
);

-- The same marketplace notification event is saved once, even if a request retries.
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_notification_event_unique
 ON notifications(user_id,type) WHERE type LIKE 'marketplace.%';

-- Use a monotonic server/database-issued number, not an AI-generated label.
-- 14 digits: date YYYYMMDD plus a 6-digit sequence, may grow past 14 digits after 999999.
CREATE OR REPLACE FUNCTION marketplace_submit_request(
 p_listing_id uuid, p_buyer_id uuid, p_quantity integer,
 p_buyer_phone text, p_state_code varchar, p_city varchar, p_request_key uuid
) RETURNS marketplace_purchase_requests LANGUAGE plpgsql AS $$
DECLARE product marketplace_listings%ROWTYPE;
        created marketplace_purchase_requests%ROWTYPE;
BEGIN
 IF p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 1000 THEN
  RAISE EXCEPTION 'INVALID_QUANTITY';
 END IF;
 IF p_buyer_phone IS NULL OR length(trim(p_buyer_phone)) < 10
    OR p_city IS NULL OR length(trim(p_city)) < 2
    OR NOT EXISTS (SELECT 1 FROM nigeria_states WHERE code = p_state_code) THEN
  RAISE EXCEPTION 'INVALID_DESTINATION';
 END IF;
 SELECT * INTO product FROM marketplace_listings
 WHERE id=p_listing_id AND status='approved' AND quantity >= p_quantity;
 IF NOT FOUND THEN RAISE EXCEPTION 'LISTING_UNAVAILABLE'; END IF;
 IF product.seller_id=p_buyer_id THEN RAISE EXCEPTION 'CANNOT_BUY_OWN_LISTING'; END IF;
 SELECT * INTO created FROM marketplace_purchase_requests
 WHERE buyer_id=p_buyer_id AND request_key=p_request_key;
 IF FOUND THEN RETURN created; END IF;
 INSERT INTO marketplace_purchase_requests(
  order_number, request_key, buyer_id, seller_id, listing_id, listing_title,
  quantity, unit_price_kobo, subtotal_kobo, buyer_phone, destination_state_code, destination_city
 ) VALUES (
  to_char(now() AT TIME ZONE 'UTC','YYYYMMDD') || lpad(nextval('marketplace_order_reference_seq')::text,6,'0'),
  p_request_key, p_buyer_id, product.seller_id, product.id, product.title,
  p_quantity, product.price_kobo, product.price_kobo*p_quantity,
  trim(p_buyer_phone), p_state_code, trim(p_city)
 ) ON CONFLICT (buyer_id, request_key) DO NOTHING RETURNING * INTO created;
 IF created.id IS NULL THEN
  SELECT * INTO created FROM marketplace_purchase_requests
  WHERE buyer_id=p_buyer_id AND request_key=p_request_key;
 END IF;
 INSERT INTO marketplace_order_events(request_id,actor_id,event_type,message)
 VALUES (created.id,p_buyer_id,'requested','Buyer requested this product. Seller confirmation required.')
 ON CONFLICT DO NOTHING;
 RETURN created;
END; $$;

CREATE OR REPLACE FUNCTION marketplace_seller_decide(
 p_id uuid, p_seller_id uuid, p_action text
) RETURNS marketplace_purchase_requests LANGUAGE plpgsql AS $$
DECLARE current_order marketplace_purchase_requests%ROWTYPE;
BEGIN
 IF p_action NOT IN ('accept','decline','unavailable') THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
 SELECT * INTO current_order FROM marketplace_purchase_requests
 WHERE id=p_id AND seller_id=p_seller_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
 IF current_order.status <> 'awaiting_seller' THEN RAISE EXCEPTION 'ORDER_ALREADY_PROCESSED'; END IF;
 IF current_order.seller_response_deadline <= now() THEN
  UPDATE marketplace_purchase_requests SET status='expired',updated_at=now()
   WHERE id=p_id RETURNING * INTO current_order;
  INSERT INTO marketplace_order_events(request_id,actor_id,event_type,message)
    VALUES (p_id,null,'expired','Seller did not confirm availability in time.');
  RETURN current_order;
 END IF;
 IF p_action='accept' THEN
  IF NOT EXISTS(SELECT 1 FROM marketplace_listings
     WHERE id=current_order.listing_id AND status='approved'
       AND quantity >= current_order.quantity) THEN
   RAISE EXCEPTION 'LISTING_UNAVAILABLE';
  END IF;
  UPDATE marketplace_purchase_requests
    SET status='seller_accepted',responded_at=now(),updated_at=now()
    WHERE id=p_id RETURNING * INTO current_order;
  INSERT INTO marketplace_order_events(request_id,actor_id,event_type,message)
    VALUES (p_id,p_seller_id,'seller_accepted','Seller confirmed stock availability. Payment is not yet enabled.');
 ELSE
  UPDATE marketplace_purchase_requests
    SET status='declined',responded_at=now(),updated_at=now()
    WHERE id=p_id RETURNING * INTO current_order;
  INSERT INTO marketplace_order_events(request_id,actor_id,event_type,message)
    VALUES (p_id,p_seller_id,'declined','Seller could not fulfill this request.');
  IF p_action='unavailable' THEN
   UPDATE marketplace_listings SET status='paused',quantity=0,updated_at=now()
     WHERE id=current_order.listing_id AND seller_id=p_seller_id;
  END IF;
 END IF;
 RETURN current_order;
END; $$;
