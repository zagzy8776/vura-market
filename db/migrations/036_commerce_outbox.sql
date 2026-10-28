-- Transactional notification outbox and query indexes. Migration runner wraps
-- unwrapped files in a transaction; do not add a separate COMMIT statement.
CREATE TABLE IF NOT EXISTS commerce_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key text NOT NULL UNIQUE,
  event_type text NOT NULL,
  request_id uuid NOT NULL REFERENCES marketplace_purchase_requests(id),
  recipient_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'dead')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 6,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  lock_token uuid,
  locked_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS commerce_outbox_due_idx
  ON commerce_outbox(status, next_run_at, id)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS commerce_outbox_request_idx ON commerce_outbox(request_id, created_at DESC);
CREATE INDEX IF NOT EXISTS commerce_outbox_stale_idx
  ON commerce_outbox(locked_at) WHERE status = 'processing';

-- The state transition and the notification obligation are committed together.
CREATE OR REPLACE FUNCTION enqueue_marketplace_state_notification()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event text;
        destination uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    event := 'requested';
    destination := NEW.seller_id;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    CASE NEW.status
      WHEN 'seller_accepted' THEN event := 'accepted'; destination := NEW.buyer_id;
      WHEN 'declined' THEN event := 'declined'; destination := NEW.buyer_id;
      WHEN 'cancelled' THEN event := 'cancelled'; destination := NEW.seller_id;
      WHEN 'expired' THEN event := 'expired'; destination := NEW.buyer_id;
      ELSE RETURN NEW;
    END CASE;
  ELSE
    RETURN NEW;
  END IF;
  INSERT INTO commerce_outbox(event_key, event_type, request_id, recipient_id)
  VALUES ('marketplace:' || NEW.id::text || ':' || event,
          event, NEW.id, destination)
  ON CONFLICT(event_key) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS marketplace_state_outbox_trigger ON marketplace_purchase_requests;
CREATE TRIGGER marketplace_state_outbox_trigger
AFTER INSERT OR UPDATE OF status ON marketplace_purchase_requests
FOR EACH ROW EXECUTE FUNCTION enqueue_marketplace_state_notification();

-- Important lookup indexes for increasing order and listing volume.
CREATE INDEX IF NOT EXISTS marketplace_request_seller_status_idx
 ON marketplace_purchase_requests(seller_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_request_buyer_status_idx
 ON marketplace_purchase_requests(buyer_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_listings_status_seller_idx
 ON marketplace_listings(status, seller_id, created_at DESC);
