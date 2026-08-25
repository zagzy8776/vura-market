BEGIN;

CREATE TABLE IF NOT EXISTS order_fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  courier_name text,
  tracking_number text,
  status text NOT NULL DEFAULT 'pending',
  delivery_address text,
  delivery_city text,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fulfillment_status_check CHECK (status IN ('pending','preparing','dispatched','in_transit','delivered','failed','cancelled'))
);

CREATE INDEX IF NOT EXISTS order_fulfillments_order_idx ON order_fulfillments(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_fulfillments_tracking_idx ON order_fulfillments(tracking_number) WHERE tracking_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS fulfillment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_id uuid NOT NULL REFERENCES order_fulfillments(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id uuid,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fulfillment_items_fulfillment_idx ON fulfillment_items(fulfillment_id);

CREATE TABLE IF NOT EXISTS delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_id uuid NOT NULL REFERENCES order_fulfillments(id) ON DELETE CASCADE,
  status text NOT NULL,
  message text NOT NULL,
  location text,
  external_event_id text,
  source text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS delivery_events_external_idx
  ON delivery_events(fulfillment_id, external_event_id)
  WHERE external_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS delivery_events_fulfillment_idx ON delivery_events(fulfillment_id, created_at DESC);

CREATE OR REPLACE FUNCTION create_fulfillment(
  p_order_id uuid,
  p_supplier_id uuid,
  p_courier_name text,
  p_tracking_number text,
  p_address text,
  p_city text,
  p_source text DEFAULT 'admin'
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = p_order_id) THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;
  INSERT INTO order_fulfillments(order_id,supplier_id,courier_name,tracking_number,delivery_address,delivery_city)
  VALUES(p_order_id,p_supplier_id,p_courier_name,p_tracking_number,p_address,p_city)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_fulfillment_status(
  p_fulfillment_id uuid,
  p_status text,
  p_message text,
  p_location text DEFAULT NULL,
  p_source text DEFAULT 'admin',
  p_external_event_id text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_event uuid;
BEGIN
  IF p_status NOT IN ('pending','preparing','dispatched','in_transit','delivered','failed','cancelled') THEN
    RAISE EXCEPTION 'INVALID_FULFILLMENT_STATUS';
  END IF;
  UPDATE order_fulfillments
     SET status=p_status,
         dispatched_at=CASE WHEN p_status='dispatched' AND dispatched_at IS NULL THEN now() ELSE dispatched_at END,
         delivered_at=CASE WHEN p_status='delivered' THEN COALESCE(delivered_at,now()) ELSE delivered_at END,
         failed_at=CASE WHEN p_status='failed' THEN COALESCE(failed_at,now()) ELSE failed_at END,
         failure_reason=CASE WHEN p_status='failed' THEN p_message ELSE failure_reason END,
         updated_at=now()
   WHERE id=p_fulfillment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FULFILLMENT_NOT_FOUND'; END IF;
  INSERT INTO delivery_events(fulfillment_id,status,message,location,external_event_id,source)
  VALUES(p_fulfillment_id,p_status,p_message,p_location,p_external_event_id,p_source)
  ON CONFLICT (fulfillment_id, external_event_id) DO NOTHING
  RETURNING id INTO v_event;
  RETURN v_event;
END;
$$;

COMMIT;
