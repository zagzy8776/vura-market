BEGIN;

CREATE TABLE IF NOT EXISTS order_tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  message text NOT NULL,
  location text,
  tracking_number text,
  source text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_tracking_events_order_idx
  ON order_tracking_events(order_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS order_tracking_events_dedupe_idx
  ON order_tracking_events(order_id, status, COALESCE(tracking_number, ''), COALESCE(location, ''), message);

CREATE OR REPLACE FUNCTION release_expired_inventory_reservations()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  released integer;
BEGIN
  WITH expired AS (
    UPDATE inventory_reservations
       SET status = 'released', released_at = now()
     WHERE status = 'active'
       AND expires_at <= now()
     RETURNING variant_id, quantity
  ), totals AS (
    SELECT variant_id, SUM(quantity)::integer AS quantity
      FROM expired
     GROUP BY variant_id
  )
  UPDATE product_variants v
     SET reserved_quantity = GREATEST(0, v.reserved_quantity - totals.quantity),
         updated_at = now()
    FROM totals
   WHERE v.id = totals.variant_id;

  GET DIAGNOSTICS released = ROW_COUNT;
  RETURN released;
END;
$$;

CREATE OR REPLACE FUNCTION append_order_tracking_event(
  p_order_id uuid,
  p_status text,
  p_message text,
  p_location text DEFAULT NULL,
  p_tracking_number text DEFAULT NULL,
  p_source text DEFAULT 'system'
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  event_id uuid;
BEGIN
  INSERT INTO order_tracking_events(order_id,status,message,location,tracking_number,source)
  VALUES(p_order_id,p_status,p_message,p_location,p_tracking_number,p_source)
  ON CONFLICT DO NOTHING
  RETURNING id INTO event_id;

  RETURN event_id;
END;
$$;

COMMIT;
