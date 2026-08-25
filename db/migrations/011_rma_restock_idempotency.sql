BEGIN;

ALTER TABLE return_requests
  ADD COLUMN IF NOT EXISTS inventory_restocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS inventory_restock_count integer NOT NULL DEFAULT 0;

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
  IF r.inventory_restocked_at IS NOT NULL THEN RETURN 0; END IF;

  FOR item IN
    SELECT ri.product_id, ri.variant_id, ri.quantity
      FROM return_items ri
     WHERE ri.return_request_id = r.id
  LOOP
    IF item.variant_id IS NULL THEN CONTINUE; END IF;

    UPDATE product_variants
       SET available_quantity = available_quantity + item.quantity,
           updated_at = now()
     WHERE id = item.variant_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'RETURN_VARIANT_NOT_FOUND'; END IF;

    INSERT INTO inventory_movements(
      variant_id, product_id, order_id, movement_type, quantity,
      reference, metadata
    )
    VALUES (
      item.variant_id, item.product_id, r.order_id, 'return', item.quantity,
      'return:' || r.id::text,
      jsonb_build_object('return_request_id', r.id, 'actor_user_id', p_actor_user_id)
    );
    changed := changed + 1;
  END LOOP;

  UPDATE return_requests
     SET inventory_restocked_at = now(),
         inventory_restock_count = changed,
         updated_at = now()
   WHERE id = r.id;

  RETURN changed;
END;
$$;

COMMIT;
