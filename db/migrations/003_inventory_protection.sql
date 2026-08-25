BEGIN;

-- Variant/SKU inventory. Existing products remain valid; a product can have zero
-- variants (legacy catalog) or many variants (new catalog).
CREATE TABLE IF NOT EXISTS product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  quantity_on_hand integer NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  quantity_reserved integer NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
  reorder_level integer NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_variants_reserved_lte_stock CHECK (quantity_reserved <= quantity_on_hand)
);

CREATE INDEX IF NOT EXISTS product_variants_product_idx
  ON product_variants(product_id, is_active);
CREATE INDEX IF NOT EXISTS product_variants_stock_idx
  ON product_variants(quantity_on_hand, quantity_reserved, reorder_level);

CREATE TABLE IF NOT EXISTS inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  CONSTRAINT inventory_reservations_status_check
    CHECK (status IN ('active', 'converted', 'released', 'expired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_active_order_variant_idx
  ON inventory_reservations(order_id, variant_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS inventory_reservations_variant_idx
  ON inventory_reservations(variant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_reservations_expiry_idx
  ON inventory_reservations(status, expires_at)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  reservation_id uuid REFERENCES inventory_reservations(id) ON DELETE SET NULL,
  movement_type text NOT NULL,
  quantity integer NOT NULL CHECK (quantity <> 0),
  quantity_before integer NOT NULL CHECK (quantity_before >= 0),
  quantity_after integer NOT NULL CHECK (quantity_after >= 0),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_movements_type_check CHECK (
    movement_type IN ('reserve','release','sale','return','restock','adjustment','damage')
  )
);

CREATE INDEX IF NOT EXISTS inventory_movements_variant_idx
  ON inventory_movements(variant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_order_idx
  ON inventory_movements(order_id, created_at DESC);

-- Atomic reservation primitive. FOR UPDATE prevents two concurrent checkouts
-- from reserving the same last units.
CREATE OR REPLACE FUNCTION reserve_inventory(
  p_variant_id uuid,
  p_order_id uuid,
  p_quantity integer,
  p_actor_user_id uuid DEFAULT NULL,
  p_expiry timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_reservation_id uuid;
  v_before integer;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Reservation quantity must be greater than zero';
  END IF;

  SELECT quantity_on_hand INTO v_before
  FROM product_variants
  WHERE id = p_variant_id AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variant is not available';
  END IF;

  IF EXISTS (
    SELECT 1 FROM inventory_reservations
    WHERE order_id = p_order_id
      AND variant_id = p_variant_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Inventory is already reserved for this order';
  END IF;

  UPDATE product_variants
  SET quantity_reserved = quantity_reserved + p_quantity,
      updated_at = now()
  WHERE id = p_variant_id
    AND quantity_reserved + p_quantity <= quantity_on_hand;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient inventory';
  END IF;

  INSERT INTO inventory_reservations(variant_id, order_id, quantity, expires_at)
  VALUES (p_variant_id, p_order_id, p_quantity, p_expiry)
  RETURNING id INTO v_reservation_id;

  INSERT INTO inventory_movements(
    variant_id, order_id, reservation_id, movement_type, quantity,
    quantity_before, quantity_after, actor_user_id, reason
  )
  VALUES (
    p_variant_id, p_order_id, v_reservation_id, 'reserve', p_quantity,
    v_before, v_before, p_actor_user_id, 'Order inventory reservation'
  );

  RETURN v_reservation_id;
END;
$$;

-- Converts an active reservation into a sale atomically.
CREATE OR REPLACE FUNCTION commit_inventory_reservation(
  p_reservation_id uuid,
  p_actor_user_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  r inventory_reservations%ROWTYPE;
  v_before integer;
BEGIN
  SELECT * INTO r
  FROM inventory_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory reservation not found';
  END IF;
  IF r.status <> 'active' THEN
    RETURN;
  END IF;

  SELECT quantity_on_hand INTO v_before
  FROM product_variants
  WHERE id = r.variant_id
  FOR UPDATE;

  UPDATE product_variants
  SET quantity_on_hand = quantity_on_hand - r.quantity,
      quantity_reserved = quantity_reserved - r.quantity,
      updated_at = now()
  WHERE id = r.variant_id
    AND quantity_reserved >= r.quantity
    AND quantity_on_hand >= r.quantity;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory state cannot be committed safely';
  END IF;

  UPDATE inventory_reservations
  SET status = 'converted', released_at = now()
  WHERE id = r.id;

  INSERT INTO inventory_movements(
    variant_id, order_id, reservation_id, movement_type, quantity,
    quantity_before, quantity_after, actor_user_id, reason
  )
  VALUES (
    r.variant_id, r.order_id, r.id, 'sale', -r.quantity,
    v_before, v_before - r.quantity, p_actor_user_id, 'Order paid/fulfilled'
  );
END;
$$;

-- Releases a reservation without changing physical stock.
CREATE OR REPLACE FUNCTION release_inventory_reservation(
  p_reservation_id uuid,
  p_reason text DEFAULT 'Reservation released',
  p_actor_user_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  r inventory_reservations%ROWTYPE;
  v_before integer;
BEGIN
  SELECT * INTO r
  FROM inventory_reservations
  WHERE id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND OR r.status <> 'active' THEN
    RETURN;
  END IF;

  SELECT quantity_on_hand INTO v_before
  FROM product_variants
  WHERE id = r.variant_id
  FOR UPDATE;

  UPDATE product_variants
  SET quantity_reserved = quantity_reserved - r.quantity,
      updated_at = now()
  WHERE id = r.variant_id
    AND quantity_reserved >= r.quantity;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory reservation cannot be released safely';
  END IF;

  UPDATE inventory_reservations
  SET status = CASE WHEN r.expires_at IS NOT NULL AND r.expires_at <= now() THEN 'expired' ELSE 'released' END,
      released_at = now()
  WHERE id = r.id;

  INSERT INTO inventory_movements(
    variant_id, order_id, reservation_id, movement_type, quantity,
    quantity_before, quantity_after, actor_user_id, reason
  )
  VALUES (
    r.variant_id, r.order_id, r.id, 'release', -r.quantity,
    v_before, v_before, p_actor_user_id, p_reason
  );
END;
$$;

COMMIT;
