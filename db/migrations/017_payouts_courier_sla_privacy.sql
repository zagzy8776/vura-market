BEGIN;

-- ============================================================
-- 016 — Supplier payouts, courier integration, SLA automation,
--       RBAC completion and customer privacy.
-- Forward-only. Idempotent statements only (safe re-apply).
-- ============================================================

-- ------------------------------------------------------------
-- 1. RBAC completion: missing roles/permissions + full matrix.
--    Historical gap: only 'owner' had any permission mappings.
-- ------------------------------------------------------------
INSERT INTO admin_roles(name,description) VALUES
  ('super_admin','Delegated full administration'),
  ('fulfillment','Delivery and shipment operations')
ON CONFLICT (name) DO NOTHING;

INSERT INTO admin_permissions(code,description) VALUES
  ('products.read','View products and catalog data'),
  ('suppliers.read','View suppliers and sourcing data'),
  ('payouts.read','View supplier payables and payouts'),
  ('payouts.manage','Create, approve and settle supplier payouts'),
  ('settings.write','Change platform settings'),
  ('sla.read','View supplier SLA metrics and violations'),
  ('courier.manage','Manage courier providers and webhook recovery')
ON CONFLICT (code) DO NOTHING;

-- Owner and super_admin always receive every permission.
INSERT INTO admin_role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM admin_roles r
CROSS JOIN admin_permissions p
WHERE r.name IN ('owner','super_admin')
ON CONFLICT DO NOTHING;

-- Least-privilege matrix for operational roles.
INSERT INTO admin_role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM (VALUES
  ('operations','orders.read'),
  ('operations','orders.update'),
  ('operations','payments.read'),
  ('operations','deliveries.manage'),
  ('operations','products.read'),
  ('operations','suppliers.read'),
  ('operations','suppliers.manage'),
  ('operations','customers.read'),
  ('operations','notifications.manage'),
  ('operations','sla.read'),
  ('operations','courier.manage'),
  ('fulfillment','orders.read'),
  ('fulfillment','deliveries.manage'),
  ('fulfillment','products.read'),
  ('fulfillment','courier.manage'),
  ('finance','finance.read'),
  ('finance','finance.export'),
  ('finance','payments.read'),
  ('finance','payments.verify'),
  ('finance','refunds.create'),
  ('finance','payouts.read'),
  ('finance','payouts.manage'),
  ('finance','reports.export'),
  ('catalog','products.create'),
  ('catalog','products.update'),
  ('catalog','products.read'),
  ('catalog','inventory.update'),
  ('catalog','suppliers.read'),
  ('support','customers.read'),
  ('support','customers.privacy'),
  ('support','orders.read'),
  ('support','notifications.manage'),
  ('analyst','reports.read'),
  ('analyst','reports.export'),
  ('analyst','finance.read'),
  ('analyst','audit.read'),
  ('analyst','products.read'),
  ('analyst','suppliers.read'),
  ('analyst','sla.read'),
  ('analyst','payouts.read')
) AS matrix(role_name, code)
JOIN admin_roles r ON r.name = matrix.role_name
JOIN admin_permissions p ON p.code = matrix.code
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 2. Supplier payable lifecycle.
--    customer payment -> held -> all fulfillments delivered ->
--    hold period elapsed -> eligible -> paying -> paid.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_payables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  fulfillment_id uuid REFERENCES order_fulfillments(id) ON DELETE SET NULL,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  status text NOT NULL DEFAULT 'held'
    CONSTRAINT supplier_payables_status_check
    CHECK (status IN ('held','eligible','paying','paid','cancelled')),
  eligible_at timestamptz,
  payout_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_payables_supplier_idx ON supplier_payables(supplier_id, status);
CREATE INDEX IF NOT EXISTS supplier_payables_status_idx ON supplier_payables(status, updated_at);

-- Idempotently create the payable once an order is paid, sourced and costed.
CREATE OR REPLACE FUNCTION ensure_supplier_payable(p_order_id uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_payment text;
  v_supplier uuid;
  v_cost bigint;
  v_fulfillment uuid;
  v_id uuid;
BEGIN
  SELECT payment_status, supplier_id, COALESCE(purchase_cost_kobo, 0)
    INTO v_payment, v_supplier, v_cost
  FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF v_payment <> 'paid' THEN RAISE EXCEPTION 'ORDER_PAYMENT_NOT_CONFIRMED'; END IF;
  IF v_supplier IS NULL THEN RAISE EXCEPTION 'SUPPLIER_NOT_ASSIGNED'; END IF;
  IF v_cost <= 0 THEN RAISE EXCEPTION 'INVALID_PAYABLE_AMOUNT'; END IF;

  SELECT f.id INTO v_fulfillment
  FROM order_fulfillments f
  WHERE f.order_id = p_order_id AND f.supplier_id = v_supplier
  ORDER BY f.delivered_at DESC NULLS LAST, f.created_at DESC
  LIMIT 1;

  INSERT INTO supplier_payables(order_id, fulfillment_id, supplier_id, amount_kobo, status)
  VALUES (p_order_id, v_fulfillment, v_supplier, v_cost, 'held')
  ON CONFLICT (order_id) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM supplier_payables WHERE order_id = p_order_id;
  END IF;
  RETURN v_id;
END;
$$;

-- Move held payables to eligible once every fulfillment is delivered and the
-- configurable hold window has elapsed. Returns number of payables released.
CREATE OR REPLACE FUNCTION evaluate_payout_eligibility()
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_hold integer;
  v_count integer := 0;
BEGIN
  SELECT COALESCE(NULLIF(value, '')::integer, 2) INTO v_hold
  FROM platform_settings WHERE key = 'payout_hold_days';
  IF v_hold IS NULL OR v_hold < 0 THEN v_hold := 2; END IF;

  UPDATE supplier_payables sp
     SET status = 'eligible',
         eligible_at = now(),
         updated_at = now()
  WHERE sp.status = 'held'
    AND EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = sp.order_id AND o.payment_status = 'paid')
    AND EXISTS (
      SELECT 1 FROM order_fulfillments f
      WHERE f.order_id = sp.order_id
        AND f.status = 'delivered'
        AND f.delivered_at <= now() - make_interval(days => v_hold))
    AND NOT EXISTS (
      SELECT 1 FROM order_fulfillments f
      WHERE f.order_id = sp.order_id
        AND f.status NOT IN ('delivered', 'cancelled'));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ------------------------------------------------------------
-- 3. Payouts, attempts and settlement.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  payout_reference text NOT NULL UNIQUE,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  status text NOT NULL DEFAULT 'pending'
    CONSTRAINT supplier_payouts_status_check
    CHECK (status IN ('pending','approved','processing','paid','failed','cancelled')),
  idempotency_key text NOT NULL UNIQUE,
  initiated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  settled_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS supplier_payouts_supplier_idx ON supplier_payouts(supplier_id, created_at DESC);

CREATE TABLE IF NOT EXISTS payout_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id uuid NOT NULL REFERENCES supplier_payouts(id) ON DELETE CASCADE,
  attempt_no integer NOT NULL,
  outcome text NOT NULL CONSTRAINT payout_attempts_outcome_check CHECK (outcome IN ('requested','succeeded','failed')),
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(payout_id, attempt_no)
);

ALTER TABLE supplier_payables
  ADD CONSTRAINT supplier_payables_payout_fk
  FOREIGN KEY (payout_id) REFERENCES supplier_payouts(id) ON DELETE SET NULL;

-- Aggregate all eligible payables into ONE deterministic payout.
-- Idempotency key is (supplier, day, retry round): retries of the same request
-- return the same payout; a FAILED payout can be retried as a new round.
CREATE OR REPLACE FUNCTION create_supplier_payout(p_supplier_id uuid, p_actor_user_id uuid)
RETURNS supplier_payouts LANGUAGE plpgsql AS $$
DECLARE
  v_ids uuid[];
  v_amount bigint;
  v_round integer;
  v_key text;
  v_ref text;
  v_row supplier_payouts%ROWTYPE;
BEGIN
  SELECT array_agg(id ORDER BY id) INTO v_ids
  FROM supplier_payables
  WHERE supplier_id = p_supplier_id AND status = 'eligible';
  IF v_ids IS NULL THEN RAISE EXCEPTION 'NO_ELIGIBLE_PAYABLES'; END IF;

  SELECT COALESCE(SUM(amount_kobo), 0)::bigint INTO v_amount
  FROM supplier_payables
  WHERE supplier_id = p_supplier_id AND status = 'eligible';
  IF v_amount <= 0 THEN RAISE EXCEPTION 'INVALID_PAYOUT_AMOUNT'; END IF;

  SELECT COALESCE(MAX(substring(idempotency_key FROM ':r(\d+)$')::integer), 0) + 1 INTO v_round
  FROM supplier_payouts
  WHERE supplier_id = p_supplier_id
    AND created_at >= date_trunc('day', now());

  v_key := 'payout:' || p_supplier_id::text || ':' || to_char(now(), 'YYYYMMDD') || ':r' || v_round;
  v_ref := 'PO-' || upper(substr(replace(p_supplier_id::text, '-', ''), 1, 8)) || '-' || to_char(now(), 'YYYYMMDDHH24MISS');

  INSERT INTO supplier_payouts(supplier_id, payout_reference, amount_kobo, status, idempotency_key, initiated_by)
  VALUES (p_supplier_id, v_ref, v_amount, 'pending', v_key, p_actor_user_id)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    -- Concurrent duplicate: return the already-created payout untouched.
    SELECT * INTO v_row FROM supplier_payouts WHERE idempotency_key = v_key;
    RETURN v_row;
  END IF;

  UPDATE supplier_payables
     SET status = 'paying', payout_id = v_row.id, updated_at = now()
   WHERE id = ANY(v_ids);

  INSERT INTO payout_attempts(payout_id, attempt_no, outcome, detail)
  VALUES (v_row.id, 1, 'requested', jsonb_build_object('payable_count', array_length(v_ids, 1), 'amount_kobo', v_amount)::text);

  RETURN v_row;
END;
$$;

-- Record the provider/bank result of a payout. Success retries after 'paid'
-- are idempotent no-ops; failures release the payables back to eligible.
CREATE OR REPLACE FUNCTION settle_supplier_payout(p_reference text, p_success boolean, p_detail text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_payout supplier_payouts%ROWTYPE;
  v_attempt integer;
BEGIN
  SELECT * INTO v_payout FROM supplier_payouts WHERE payout_reference = p_reference;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYOUT_NOT_FOUND'; END IF;

  IF p_success AND v_payout.status = 'paid' THEN
    RETURN 'already_paid';
  END IF;
  IF v_payout.status IN ('paid','cancelled') THEN
    RAISE EXCEPTION 'INVALID_PAYOUT_STATE';
  END IF;

  SELECT COALESCE(MAX(attempt_no), 1) + 1 INTO v_attempt
  FROM payout_attempts WHERE payout_id = v_payout.id;

  IF p_success THEN
    UPDATE supplier_payouts SET status = 'paid', settled_at = now(), failure_reason = NULL, updated_at = now()
     WHERE id = v_payout.id;
    UPDATE supplier_payables SET status = 'paid', updated_at = now()
     WHERE payout_id = v_payout.id AND status = 'paying';
    INSERT INTO payout_attempts(payout_id, attempt_no, outcome, detail)
    VALUES (v_payout.id, v_attempt, 'succeeded', p_detail);
    RETURN 'paid';
  ELSE
    UPDATE supplier_payouts SET status = 'failed', failure_reason = COALESCE(p_detail, 'unspecified'), updated_at = now()
     WHERE id = v_payout.id;
    UPDATE supplier_payables SET status = 'eligible', eligible_at = now(), updated_at = now()
     WHERE payout_id = v_payout.id AND status = 'paying';
    INSERT INTO payout_attempts(payout_id, attempt_no, outcome, detail)
    VALUES (v_payout.id, v_attempt, 'failed', p_detail);
    RETURN 'failed';
  END IF;
END;
$$;

-- Derived supplier balance (no duplicated balance state to drift).
CREATE OR REPLACE VIEW supplier_balances AS
SELECT s.id AS supplier_id, s.name,
  COALESCE(SUM(sp.amount_kobo) FILTER (WHERE sp.status = 'held'), 0)::bigint AS held_kobo,
  COALESCE(SUM(sp.amount_kobo) FILTER (WHERE sp.status = 'eligible'), 0)::bigint AS available_kobo,
  COALESCE(SUM(sp.amount_kobo) FILTER (WHERE sp.status = 'paying'), 0)::bigint AS in_flight_kobo,
  COALESCE(SUM(sp.amount_kobo) FILTER (WHERE sp.status = 'paid'), 0)::bigint AS paid_kobo
FROM suppliers s
LEFT JOIN supplier_payables sp ON sp.supplier_id = s.id
GROUP BY s.id, s.name;

-- ------------------------------------------------------------
-- 4. Courier provider abstraction storage.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS courier_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  api_base_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO courier_providers(code, name) VALUES ('manual', 'Manual / offline courier')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE order_fulfillments ADD COLUMN IF NOT EXISTS courier_provider_id uuid REFERENCES courier_providers(id) ON DELETE SET NULL;
ALTER TABLE order_fulfillments ADD COLUMN IF NOT EXISTS provider_shipment_ref text;

CREATE TABLE IF NOT EXISTS courier_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code text NOT NULL,
  external_event_id text NOT NULL,
  tracking_number text,
  payload jsonb NOT NULL,
  signature_valid boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'received'
    CONSTRAINT courier_webhook_events_status_check
    CHECK (status IN ('received','processed','failed','dead_letter')),
  retry_count integer NOT NULL DEFAULT 0,
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(provider_code, external_event_id)
);
CREATE INDEX IF NOT EXISTS courier_webhook_events_status_idx ON courier_webhook_events(status, received_at);

-- Apply a normalized courier event to the fulfillment with that tracking
-- number. Idempotent through delivery_events(fulfillment_id, external_event_id).
CREATE OR REPLACE FUNCTION apply_courier_tracking_event(
  p_tracking_number text,
  p_external_event_id text,
  p_status text,
  p_message text,
  p_location text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_fulfillment uuid;
BEGIN
  SELECT f.id INTO v_fulfillment
  FROM order_fulfillments f
  WHERE f.tracking_number = p_tracking_number
  ORDER BY f.created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'TRACKING_NOT_FOUND'; END IF;
  RETURN update_fulfillment_status(v_fulfillment, p_status, p_message, p_location, 'courier', p_external_event_id);
END;
$$;

-- ------------------------------------------------------------
-- 5. Supplier SLA automation storage.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sla_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES suppliers(id) ON DELETE CASCADE,
  violation_type text NOT NULL
    CONSTRAINT sla_violations_type_check
    CHECK (violation_type IN ('late_dispatch','late_delivery','high_defect_rate','low_on_time_rate','high_cancellation_rate')),
  reference_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  UNIQUE(supplier_id, violation_type, reference_id)
);

INSERT INTO platform_settings(key, value) VALUES
  ('payout_hold_days', '2'),
  ('sla_dispatch_hours', '48'),
  ('sla_delivery_hours', '120'),
  ('sla_defect_rate_max_pct', '10'),
  ('sla_on_time_min_pct', '80')
ON CONFLICT (key) DO NOTHING;

-- Real derived metrics; scores are computed from these, never invented.
CREATE OR REPLACE VIEW supplier_sla_metrics AS
SELECT s.id AS supplier_id,
       s.name AS supplier_name,
       s.reliability_score,
       COUNT(f.id)::int AS shipments_total,
       COUNT(f.id) FILTER (WHERE f.status = 'delivered')::int AS shipments_delivered,
       COUNT(f.id) FILTER (WHERE f.status = 'cancelled')::int AS shipments_cancelled,
       COUNT(f.id) FILTER (WHERE f.status = 'failed')::int AS shipments_failed,
       COUNT(f.id) FILTER (WHERE f.dispatched_at IS NOT NULL)::int AS dispatched_total,
       ROUND(AVG(EXTRACT(EPOCH FROM (f.dispatched_at - f.created_at)) / 3600.0) FILTER (WHERE f.dispatched_at IS NOT NULL), 2) AS avg_dispatch_hours,
       ROUND(AVG(EXTRACT(EPOCH FROM (f.delivered_at - f.dispatched_at)) / 3600.0) FILTER (WHERE f.delivered_at IS NOT NULL AND f.dispatched_at IS NOT NULL), 2) AS avg_delivery_hours,
       (SELECT COUNT(*)::int FROM return_requests rr JOIN order_fulfillments f2 ON f2.id = rr.fulfillment_id WHERE f2.supplier_id = s.id) AS returns_total,
       MAX(f.updated_at) AS last_activity_at
FROM suppliers s
LEFT JOIN order_fulfillments f ON f.supplier_id = s.id
GROUP BY s.id, s.name, s.reliability_score;

-- ------------------------------------------------------------
-- 6. Customer privacy: irreversible PII anonymization that keeps
--    legally required transaction/financial records intact.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION anonymize_customer(p_user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_anon_suffix text;
BEGIN
  SELECT substr(encode(gen_random_bytes(12), 'hex'), 1, 20) INTO v_anon_suffix;
  UPDATE users
     SET name = 'Deleted User',
         email = 'anon+' || v_anon_suffix || '@anonymized.invalid',
         password_hash = '!anonymized:no-login:' || v_anon_suffix,
         updated_at = now()
   WHERE id = p_user_id AND role = 'customer';
  IF NOT FOUND THEN RAISE EXCEPTION 'USER_NOT_ANONYMIZABLE'; END IF;

  UPDATE orders
     SET delivery_name = 'Deleted User',
         delivery_phone = 'ANONYMIZED',
         delivery_address = 'ANONYMIZED',
         delivery_city = 'ANONYMIZED',
         updated_at = now()
   WHERE buyer_id = p_user_id;

  DELETE FROM sessions WHERE user_id = p_user_id;
  DELETE FROM account_claim_tokens WHERE user_id = p_user_id;
  DELETE FROM notifications WHERE user_id = p_user_id;
  UPDATE email_deliveries SET recipient = 'anonymized@invalid' WHERE user_id = p_user_id;
END;
$$;

COMMIT;







