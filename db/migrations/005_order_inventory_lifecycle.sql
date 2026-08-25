BEGIN;

-- Order-level inventory transitions keep the admin payment/status mutation
-- simple and make multi-variant orders atomic at the database boundary.
CREATE OR REPLACE FUNCTION commit_order_inventory(
  p_order_id uuid,
  p_actor_user_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT id
    FROM inventory_reservations
    WHERE order_id = p_order_id
      AND status = 'active'
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    PERFORM commit_inventory_reservation(r.id, p_actor_user_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION release_order_inventory(
  p_order_id uuid,
  p_reason text DEFAULT 'Order inventory released',
  p_actor_user_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT id
    FROM inventory_reservations
    WHERE order_id = p_order_id
      AND status = 'active'
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    PERFORM release_inventory_reservation(r.id, p_reason, p_actor_user_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

COMMIT;
