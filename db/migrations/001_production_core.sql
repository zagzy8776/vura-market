BEGIN;

-- Production commerce primitives. This migration is additive and keeps the
-- existing Vura bank-transfer checkout intact. Do not run in production until
-- reviewed and applied through the project's migration process.

CREATE TABLE IF NOT EXISTS product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku text UNIQUE,
  name text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  price_kobo bigint CHECK (price_kobo IS NULL OR price_kobo > 0),
  source_price_kobo bigint CHECK (source_price_kobo IS NULL OR source_price_kobo >= 0),
  available_quantity integer NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
  reserved_quantity integer NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_variants_reserved_lte_available CHECK (reserved_quantity <= available_quantity)
);

CREATE INDEX IF NOT EXISTS product_variants_product_idx ON product_variants(product_id, is_active);
CREATE INDEX IF NOT EXISTS product_variants_stock_idx ON product_variants(available_quantity, reserved_quantity);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  movement_type text NOT NULL,
  quantity integer NOT NULL,
  reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_movement_type_check CHECK (movement_type IN ('receive','reserve','release','sale','return','adjustment','damage')),
  CONSTRAINT inventory_movement_quantity_check CHECK (quantity <> 0)
);

CREATE INDEX IF NOT EXISTS inventory_movements_product_idx ON inventory_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_variant_idx ON inventory_movements(variant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_order_idx ON inventory_movements(order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  tracking_number text,
  courier_name text,
  courier_reference text,
  delivery_address text NOT NULL,
  delivery_city text NOT NULL,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fulfillment_status_check CHECK (status IN ('pending','supplier_confirmed','purchased','ready_for_dispatch','dispatched','in_transit','delivered','failed','returned','cancelled'))
);

CREATE INDEX IF NOT EXISTS order_fulfillments_order_idx ON order_fulfillments(order_id, created_at);
CREATE INDEX IF NOT EXISTS order_fulfillments_supplier_idx ON order_fulfillments(supplier_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS order_fulfillments_tracking_idx ON order_fulfillments(tracking_number);

CREATE TABLE IF NOT EXISTS fulfillment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_id uuid NOT NULL REFERENCES order_fulfillments(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_kobo bigint NOT NULL CHECK (unit_price_kobo >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fulfillment_items_fulfillment_idx ON fulfillment_items(fulfillment_id);
CREATE INDEX IF NOT EXISTS fulfillment_items_product_idx ON fulfillment_items(product_id, variant_id);

CREATE TABLE IF NOT EXISTS shipment_tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_id uuid NOT NULL REFERENCES order_fulfillments(id) ON DELETE CASCADE,
  external_event_id text,
  source text NOT NULL DEFAULT 'manual',
  status text NOT NULL,
  location text,
  message text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source, external_event_id)
);

CREATE INDEX IF NOT EXISTS shipment_tracking_events_fulfillment_idx ON shipment_tracking_events(fulfillment_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  transaction_reference text UNIQUE NOT NULL,
  provider text NOT NULL DEFAULT 'bank_transfer',
  payment_method text NOT NULL DEFAULT 'bank_transfer',
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  currency text NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'pending',
  external_reference text,
  idempotency_key text UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_transaction_status_check CHECK (status IN ('pending','confirmed','failed','reversed','refunded','partially_refunded'))
);

CREATE INDEX IF NOT EXISTS payment_transactions_order_idx ON payment_transactions(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_transactions_status_idx ON payment_transactions(status, created_at DESC);

CREATE TABLE IF NOT EXISTS ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  account_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_account_type_check CHECK (account_type IN ('asset','liability','revenue','expense','equity'))
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES payment_transactions(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES orders(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES ledger_accounts(id) ON DELETE RESTRICT,
  entry_type text NOT NULL,
  amount_kobo bigint NOT NULL CHECK (amount_kobo <> 0),
  currency text NOT NULL DEFAULT 'NGN',
  reference text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reference, account_id)
);

CREATE INDEX IF NOT EXISTS ledger_entries_transaction_idx ON ledger_entries(transaction_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ledger_entries_order_idx ON ledger_entries(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ledger_entries_account_idx ON ledger_entries(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  payment_transaction_id uuid REFERENCES payment_transactions(id) ON DELETE RESTRICT,
  amount_kobo bigint NOT NULL CHECK (amount_kobo > 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  idempotency_key text UNIQUE,
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refund_status_check CHECK (status IN ('requested','approved','processing','completed','rejected','failed'))
);

CREATE INDEX IF NOT EXISTS refunds_order_idx ON refunds(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS refunds_status_idx ON refunds(status, created_at DESC);

CREATE TABLE IF NOT EXISTS return_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rma_number text UNIQUE NOT NULL,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  fulfillment_id uuid REFERENCES order_fulfillments(id) ON DELETE SET NULL,
  reason text NOT NULL,
  customer_note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'requested',
  return_tracking_number text,
  inspection_result text,
  refund_id uuid REFERENCES refunds(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT return_request_status_check CHECK (status IN ('requested','approved','return_in_transit','received','inspecting','refunded','replaced','rejected','cancelled'))
);

CREATE INDEX IF NOT EXISTS return_requests_order_idx ON return_requests(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS return_requests_status_idx ON return_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id uuid NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel text NOT NULL,
  destination text NOT NULL,
  event_key text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  attempt_count integer NOT NULL DEFAULT 0,
  provider_reference text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_key, channel, destination),
  CONSTRAINT notification_delivery_status_check CHECK (status IN ('queued','sending','sent','failed','dead_letter'))
);

CREATE INDEX IF NOT EXISTS notification_deliveries_status_idx ON notification_deliveries(status, created_at);
CREATE INDEX IF NOT EXISTS notification_deliveries_notification_idx ON notification_deliveries(notification_id);

CREATE TABLE IF NOT EXISTS job_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL,
  idempotency_key text UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_queue_status_check CHECK (status IN ('queued','processing','completed','failed','dead_letter'))
);

CREATE INDEX IF NOT EXISTS job_queue_ready_idx ON job_queue(status, available_at);

-- RBAC is additive to the existing customer/admin role model. Existing admins
-- remain valid until application authorization is switched to permission checks.
CREATE TABLE IF NOT EXISTS admin_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_role_permissions (
  role_id uuid NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES admin_permissions(id) ON DELETE CASCADE,
  PRIMARY KEY(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS admin_user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, role_id)
);

INSERT INTO ledger_accounts(code,name,account_type) VALUES
  ('CASH_PENDING','Customer funds pending','asset'),
  ('CUSTOMER_REFUNDS','Customer refunds payable','liability'),
  ('SALES_REVENUE','Sales revenue','revenue'),
  ('SUPPLIER_COST','Supplier cost','expense'),
  ('DELIVERY_COST','Delivery cost','expense'),
  ('OTHER_OPERATING_COST','Other operating cost','expense')
ON CONFLICT (code) DO NOTHING;

INSERT INTO admin_roles(name,description) VALUES
  ('owner','Full Vura administration'),
  ('operations','Orders, sourcing and deliveries'),
  ('catalog','Products, categories and inventory'),
  ('finance','Payments, refunds and finance reports'),
  ('support','Customers and communications'),
  ('analyst','Read-only reports and analytics')
ON CONFLICT (name) DO NOTHING;

INSERT INTO admin_permissions(code,description) VALUES
  ('orders.read','View orders'),
  ('orders.update','Update order operations'),
  ('payments.read','View payment records'),
  ('payments.verify','Verify customer payments'),
  ('refunds.create','Create refunds'),
  ('finance.read','View finance'),
  ('finance.export','Export finance reports'),
  ('products.create','Create products'),
  ('products.update','Update products'),
  ('inventory.update','Update inventory'),
  ('suppliers.manage','Manage suppliers'),
  ('deliveries.manage','Manage deliveries'),
  ('customers.read','View customers'),
  ('customers.privacy','Export/anonymize customer data'),
  ('reports.read','View reports'),
  ('reports.export','Export reports'),
  ('notifications.manage','Manage notifications'),
  ('audit.read','View audit log'),
  ('admin.manage','Manage admin access')
ON CONFLICT (code) DO NOTHING;

INSERT INTO admin_role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM admin_roles r CROSS JOIN admin_permissions p
WHERE r.name = 'owner'
ON CONFLICT DO NOTHING;

COMMIT;
