BEGIN;

-- Payment/finance hardening. Additive: it does not replace Vura's existing bank-transfer flow.
-- Apply only after 001_production_core.sql has been reviewed and applied in staging.

CREATE TABLE IF NOT EXISTS supplier_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES orders(id) ON DELETE RESTRICT,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  currency text NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'held',
  eligible_at timestamptz,
  released_at timestamptz,
  paid_at timestamptz,
  hold_reason text,
  payout_reference text UNIQUE,
  idempotency_key text UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_payout_status_check CHECK (status IN ('held','eligible','processing','paid','failed','cancelled'))
);

CREATE INDEX IF NOT EXISTS supplier_payouts_supplier_idx ON supplier_payouts(supplier_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS supplier_payouts_order_idx ON supplier_payouts(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS supplier_payouts_eligible_idx ON supplier_payouts(status, eligible_at);

-- One confirmed transaction per external payment reference prevents duplicate webhook credits.
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_external_confirmed_idx
  ON payment_transactions(external_reference)
  WHERE external_reference IS NOT NULL AND status IN ('confirmed','reversed','refunded','partially_refunded');

-- A payment cannot be confirmed for more than the order total through this table alone.
-- Application code must still perform the transactional amount check before confirmation.
CREATE INDEX IF NOT EXISTS payment_transactions_idempotency_idx
  ON payment_transactions(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Refunds need a deterministic reference for provider retries.
CREATE UNIQUE INDEX IF NOT EXISTS refunds_completed_order_reference_idx
  ON refunds(order_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Fast reconciliation queries.
CREATE INDEX IF NOT EXISTS ledger_entries_reference_idx ON ledger_entries(reference);
CREATE INDEX IF NOT EXISTS ledger_entries_created_idx ON ledger_entries(created_at DESC);

-- Seed the minimum chart of accounts without duplicating existing rows.
INSERT INTO ledger_accounts(code,name,account_type) VALUES
  ('PAYMENT_CLEARING','Customer payment clearing','asset'),
  ('SALES_REVENUE','Product sales revenue','revenue'),
  ('SUPPLIER_COST','Supplier/product sourcing cost','expense'),
  ('DELIVERY_COST','Delivery and logistics cost','expense'),
  ('OTHER_OPERATING_COST','Other operating cost','expense'),
  ('SUPPLIER_PAYABLE','Supplier payout payable','liability'),
  ('REFUND_PAYABLE','Customer refund payable','liability')
ON CONFLICT (code) DO NOTHING;

COMMIT;
