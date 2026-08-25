BEGIN;

-- Make RMA completion atomic: the status transition and inventory restock
-- must succeed or fail together. This prevents a refunded RMA with no stock
-- restoration if the second database operation fails.
CREATE OR REPLACE FUNCTION complete_return_and_restock(
  p_return_request_id uuid,
  p_actor_user_id uuid DEFAULT NULL,
  p_return_tracking_number text DEFAULT NULL,
  p_inspection_result text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  current_return return_requests%ROWTYPE;
  restocked integer;
BEGIN
  SELECT * INTO current_return
    FROM return_requests
   WHERE id = p_return_request_id
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'RETURN_NOT_FOUND'; END IF;

  IF current_return.status = 'refunded' THEN
    RETURN 0;
  END IF;

  UPDATE return_requests
     SET status = 'refunded',
         return_tracking_number = COALESCE(p_return_tracking_number, return_tracking_number),
         inspection_result = COALESCE(p_inspection_result, inspection_result),
         updated_at = now()
   WHERE id = p_return_request_id;

  SELECT reconcile_return_inventory(p_return_request_id, p_actor_user_id)
    INTO restocked;

  RETURN restocked;
END;
$$;

COMMIT;
