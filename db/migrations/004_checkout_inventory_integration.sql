BEGIN;

-- Keep checkout + reservation in one database transaction. If reservation fails,
-- the order insert is rolled back and the customer never gets an unreservable order.
CREATE OR REPLACE FUNCTION create_order_with_inventory(
  p_buyer_id uuid,
  p_product_id uuid,
  p_variant_id uuid,
  p_quantity integer,
  p_delivery_name text,
  p_delivery_phone text,
  p_delivery_address text,
  p_delivery_city text
) RETURNS TABLE (
  id uuid,
  order_number text,
  total_kobo bigint,
  payment_method text,
  payment_status text,
  variant_id uuid,
  reservation_id uuid
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_price bigint;
  v_product_variant_count integer;
  v_order_id uuid;
  v_reservation_id uuid;
BEGIN
  IF p_quantity < 1 OR p_quantity > 10 THEN
    RAISE EXCEPTION 'Invalid order quantity';
  END IF;

  SELECT price_kobo INTO v_price
  FROM products
  WHERE products.id = p_product_id
    AND products.is_active = true
    AND products.stock_status = 'available';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'That product is no longer available';
  END IF;

  SELECT count(*)::integer INTO v_product_variant_count
  FROM product_variants
  WHERE product_variants.product_id = p_product_id
    AND product_variants.is_active = true;

  IF v_product_variant_count > 0 AND p_variant_id IS NULL THEN
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

  INSERT INTO orders (
    buyer_id, product_id, quantity, unit_price_kobo, total_kobo,
    delivery_name, delivery_phone, delivery_address, delivery_city,
    payment_method
  )
  VALUES (
    p_buyer_id, p_product_id, p_quantity, v_price, v_price * p_quantity,
    p_delivery_name, p_delivery_phone, p_delivery_address, p_delivery_city,
    'bank_transfer'
  )
  RETURNING orders.id INTO v_order_id;

  IF p_variant_id IS NOT NULL THEN
    v_reservation_id := reserve_inventory(
      p_variant_id,
      v_order_id,
      p_quantity,
      p_buyer_id,
      now() + interval '30 minutes'
    );
  END IF;

  UPDATE orders
  SET order_number = 'VURA-' || UPPER(SUBSTRING(REPLACE(id::text, '-', '') FROM 1 FOR 10))
  WHERE orders.id = v_order_id;

  RETURN QUERY
  SELECT orders.id,
         orders.order_number,
         orders.total_kobo,
         orders.payment_method,
         orders.payment_status,
         p_variant_id,
         v_reservation_id
  FROM orders
  WHERE orders.id = v_order_id;
END;
$$;

COMMIT;
