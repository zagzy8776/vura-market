BEGIN;

-- Canonical inventory compatibility layer. The production core uses
-- available_quantity/reserved_quantity; the hardening migration used
-- quantity_on_hand/quantity_reserved. Keep one canonical representation for
-- new return/reconciliation logic and expose the legacy names as views/helpers.
ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS available_quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reserved_quantity integer NOT NULL DEFAULT 0;

UPDATE product_variants
SET available_quantity = COALESCE(NULLIF(available_quantity, 0), quantity_on_hand, 0),
    reserved_quantity = COALESCE(NULLIF(reserved_quantity, 0), quantity_reserved, 0)
WHERE TRUE;

ALTER TABLE product_variants
  ADD CONSTRAINT product_variants_inventory_nonnegative
  CHECK (available_quantity >= 0 AND reserved_quantity >= 0 AND reserved_quantity <= available_quantity)
  NOT VALID;

CREATE OR REPLACE FUNCTION reconcile_return_inventory(
  p_return_request_id uuid,
  p_actor_user_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  r return_requests%ROWTYPE;
  item record;
  changed integer := 0;
BEGIN
  SELECT * INTO r FROM return_requests WHERE id = p_return_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RETURN_NOT_FOUND'; END IF;
  IF r.status <> 'refunded' THEN RAISE EXCEPTION 'RETURN_NOT_REFUNDED'; END IF;

  FOR item IN
    SELECT ri.product_id, ri.variant_id, ri.quantity
      FROM return_items ri
     WHERE ri.return_request_id = r.id
  LOOP
    IF item.variant_id IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE product_variants
       SET available_quantity = available_quantity + item.quantity,
           quantity_on_hand = COALESCE(quantity_on_hand, 0) + item.quantity,
           updated_at = now()
     WHERE id = item.variant_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'RETURN_VARIANT_NOT_FOUND'; END IF;

    INSERT INTO inventory_movements(
      variant_id, order_id, movement_type, quantity,
      quantity_before, quantity_after, actor_user_id, reason, metadata
    )
    SELECT item.variant_id, r.order_id, 'return', item.quantity,
           GREATEST(0, pv.available_quantity - item.quantity), pv.available_quantity,
           p_actor_user_id, 'Returned item restocked',
           jsonb_build_object('return_request_id', r.id)
      FROM product_variants pv
     WHERE pv.id = item.variant_id;

    changed := changed + 1;
  END LOOP;

  RETURN changed;
END;
$$;

COMMIT;
