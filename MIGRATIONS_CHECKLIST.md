# Database Migrations Checklist

This document tracks the database migrations needed to implement the 5 critical fixes.

## Current Migration State

**Last Migration:** `018_email_retry.sql`
**Next Migration Number:** 019

## Required Migrations

### ✅ Already Exist (No Action Needed)

- ✅ RBAC foundation (`007_rbac_foundation.sql`)
- ✅ Refund ledger functions (`009_financial_refund_ledger.sql`)
- ✅ RMA completion functions (`012_atomic_rma_completion.sql`)
- ✅ Orders table with status fields
- ✅ Refunds table with status tracking
- ✅ Return requests table (return_requests)
- ✅ Return items table (return_items)
- ✅ Fulfillment tables and delivery functions

### ❌ New Migrations Required

#### 1. Migration 019: RBAC Permissions Seed

**Issue:** Issue 1 (Permission Checks)
**File:** `db/migrations/019_rbac_permissions_seed.sql`
**Size:** ~2 KB
**Risk:** Low (additive only)
**Depends On:** `007_rbac_foundation.sql`

**What It Does:**
- Seeds default permissions for all admin endpoints
- Assigns permissions to admin roles (owner, manager, viewer, etc.)

**SQL Operations:**
```
INSERT admin_permissions (codes)
  - dashboard.read
  - products.read, products.create, products.write
  - suppliers.read, suppliers.create, suppliers.write
  - orders.read, orders.write
  - customers.read
  - notifications.read
  - delivery.read, delivery.write
  - finance.read
  - refunds.create

INSERT admin_role_permissions
  - Owner role gets all permissions
  - Manager role gets most except finance
  - Viewer role gets read-only
```

**Testing:**
- Verify each permission code is unique
- Verify roles have correct permission sets
- Verify query `has_admin_permission()` returns correct results

---

#### 2. Migration 020: Order Version Control

**Issue:** Issue 2 (Concurrent Edit Protection)
**File:** `db/migrations/020_order_version_control.sql`
**Size:** ~3 KB
**Risk:** Low (purely additive)
**Depends On:** None

**What It Does:**
- Adds `version` column to orders table
- Adds `version` column to order_fulfillments table
- Creates indexes for version queries
- Provides optimistic locking pattern

**SQL Operations:**
```
ALTER TABLE orders ADD COLUMN version INTEGER DEFAULT 1;
ALTER TABLE order_fulfillments ADD COLUMN version INTEGER DEFAULT 1;
CREATE INDEX orders_version_idx ON orders(id, version);
CREATE INDEX order_fulfillments_version_idx ON order_fulfillments(id, version);

-- Update existing rows to version 1 (already default)
-- No data migration needed
```

**Testing:**
- UPDATE orders SET version=version+1 WHERE id=? AND version=?
- Verify update fails when version doesn't match
- Verify version increments on successful update

---

#### 3. Migration 021: Refund Completion Flow

**Issue:** Issue 3 (Refund Processing)
**File:** `db/migrations/021_refund_completion_flow.sql`
**Size:** ~8 KB
**Risk:** Medium (adds critical business logic functions)
**Depends On:** `009_financial_refund_ledger.sql`

**What It Does:**
- Adds columns: processed_at, completed_at, failed_at, failure_reason
- Creates `complete_refund()` function (posts ledger entries)
- Creates `fail_refund()` function (rejects refund)
- Maintains idempotency

**SQL Operations:**
```
ALTER TABLE refunds ADD COLUMNS:
  - processed_at timestamptz
  - completed_at timestamptz  
  - failed_at timestamptz
  - failure_reason text

CREATE FUNCTION complete_refund(...)
  - Transitions refund: approved → processing → completed
  - Calls post_refund_ledger() to create accounting entries
  - Atomic: both succeed or both fail

CREATE FUNCTION fail_refund(...)
  - Transitions refund: approved/processing → failed
  - Stores failure reason
  - No ledger entries posted
```

**Testing:**
- Call complete_refund() on approved refund → ledger entries created
- Call complete_refund() twice → idempotent
- Call fail_refund() → status becomes failed
- Verify ledger entries correct amount and accounts

---

#### 4. Migration 022: RMA Inspection Workflow

**Issue:** Issue 4 (RMA Workflow)
**File:** `db/migrations/022_rma_inspection_workflow.sql`
**Size:** ~15 KB
**Risk:** High (complex workflow state machine)
**Depends On:** `021_refund_completion_flow.sql`

**What It Does:**
- Adds RMA inspection tracking columns
- Creates RMA events table for audit trail
- Creates workflow functions:
  - `mark_rma_received()` - return_in_transit → received
  - `start_rma_inspection()` - received → inspecting
  - `complete_rma_with_outcome()` - inspecting → (refunded|replaced|rejected)
- Integrates with inventory restock and refund completion

**SQL Operations:**
```
ALTER TABLE return_requests ADD COLUMNS:
  - received_at timestamptz
  - inspection_started_at timestamptz
  - inspection_notes text
  - inspection_decision text (refund, replace, reject)
  - decided_by uuid (user who decided)
  - decided_at timestamptz
  - replacement_order_id uuid (for replace option)
  - approved_at timestamptz
  - approved_by uuid

CREATE TABLE rma_events (tracks inspection progression)

CREATE FUNCTION mark_rma_received()
  - Transition: return_in_transit → received
  - Record event
  
CREATE FUNCTION start_rma_inspection()
  - Transition: received → inspecting
  - Record event

CREATE FUNCTION complete_rma_with_outcome()
  - Decision: refund, replace, reject
  - Each has different outcome:
    - refund: create refund → complete_refund() → restock inventory
    - replace: mark replaced, restock inventory (new order created manually)
    - reject: restock inventory, customer keeps item or ships back
  - Atomic with inventory reconciliation
```

**Testing:**
- Flow: approved → return_in_transit → received → inspecting → refunded
- Flow: received → inspecting → rejected
- Verify inventory restocked on refund decision
- Verify refund ledger posted on refund decision
- Test all three decision paths
- Verify events recorded

---

#### 5. Migration 023: Multi-Item Cart Model

**Issue:** Issue 5 (Multi-Item Orders)
**File:** `db/migrations/023_multi_item_cart_model.sql`
**Size:** ~12 KB
**Risk:** High (fundamental data model change)
**Depends On:** None directly, but should come after others stabilize

**What It Does:**
- Creates carts table
- Creates cart_items table
- Creates order_items table (new!)
- Adds backward compatibility via view
- Maintains existing orders table (product_id kept for legacy)

**SQL Operations:**
```
CREATE TABLE carts (
  id, buyer_id, status, expires_at, checkout_started_at, checked_out_at
  - Status: active, abandoned, checked_out, expired
)

CREATE TABLE cart_items (
  id, cart_id, product_id, quantity, price_kobo, variant_id
  - One product per cart (UNIQUE constraint)
)

CREATE TABLE order_items (
  id, order_id, product_id, quantity, unit_price_kobo, total_kobo, variant_id
  - Multiple items per order
  - Total = unit_price * quantity (constraint enforced)
)

ALTER TABLE orders ADD:
  - item_count integer DEFAULT 1
  - cart_id uuid REFERENCES carts

CREATE VIEW order_with_product AS
  - Shows first order item as product_id, quantity
  - For backward compatibility with old code
  - Can be removed once all code migrated

CREATE INDEXES:
  - carts_buyer_active_idx
  - carts_expires_idx
  - cart_items_cart_idx
  - order_items_order_idx
  - order_items_product_idx
```

**Data Compatibility:**
- Existing orders keep product_id (legacy)
- New orders created via cart use order_items
- View provides backward compatibility layer
- No data migration needed initially

**Testing:**
- Cart CRUD operations
- Add/remove/update cart items
- Checkout creates order with order_items
- Backward compat view works
- Multi-supplier fulfillments created correctly

---

## Migration Dependencies Graph

```
001_production_core
        ↓
002_payment_integrity
        ↓
007_rbac_foundation ← 019_rbac_permissions_seed
        ↓
009_financial_refund_ledger
        ↓
012_atomic_rma_completion
        ↓
        └─→ 020_order_version_control
                ↓
        └─→ 021_refund_completion_flow
                ↓
        └─→ 022_rma_inspection_workflow
                ↓
        └─→ 023_multi_item_cart_model (independent)
```

## Execution Order

### Safe to Run in Parallel:
- 019 (permissions) - isolated
- 020 (versioning) - isolated
- 023 (cart model) - independent tables

### Must Run Sequentially:
- 021 must run after 009 (refund ledger functions)
- 022 must run after 021 (uses complete_refund)

### Recommended Order:
```
1. 019_rbac_permissions_seed.sql     (Issue 1 foundation)
2. 020_order_version_control.sql     (Issue 2 foundation)
3. 021_refund_completion_flow.sql    (Issue 3 implementation)
4. 022_rma_inspection_workflow.sql   (Issue 4 implementation)
5. 023_multi_item_cart_model.sql     (Issue 5 implementation)
```

## Rollback Strategy

Each migration should be reversible:

```sql
-- Rollback 023:
DROP TABLE order_items CASCADE;
DROP TABLE cart_items CASCADE;
DROP TABLE carts CASCADE;
DROP VIEW order_with_product;
ALTER TABLE orders DROP COLUMN item_count, DROP COLUMN cart_id;

-- Rollback 022:
DROP TABLE rma_events CASCADE;
DROP FUNCTION IF EXISTS complete_rma_with_outcome(...);
DROP FUNCTION IF EXISTS start_rma_inspection(...);
DROP FUNCTION IF EXISTS mark_rma_received(...);
ALTER TABLE return_requests DROP COLUMNS (received_at, inspection_started_at, ...);

-- Rollback 021:
DROP FUNCTION IF EXISTS fail_refund(...);
DROP FUNCTION IF EXISTS complete_refund(...);
ALTER TABLE refunds DROP COLUMNS (processed_at, completed_at, failed_at, failure_reason);

-- Rollback 020:
DROP INDEX IF EXISTS order_fulfillments_version_idx;
DROP INDEX IF EXISTS orders_version_idx;
ALTER TABLE order_fulfillments DROP COLUMN version;
ALTER TABLE orders DROP COLUMN version;

-- Rollback 019:
DELETE FROM admin_role_permissions WHERE permission_id IN (
  SELECT id FROM admin_permissions WHERE code LIKE 'dashboard.%' 
  OR code LIKE 'products.%' OR code LIKE 'suppliers.%' ...
);
DELETE FROM admin_permissions WHERE code IN (...);
```

## Testing Checklist

### Pre-Migration Testing

- [ ] Full schema backups created
- [ ] Rollback procedures documented and tested
- [ ] All functions have unit tests written
- [ ] View queries tested against sample data
- [ ] Index performance verified
- [ ] Foreign key constraints verified

### Post-Migration Testing

- [ ] Run existing test suite - all pass
- [ ] Run new migration-specific tests
- [ ] Verify no duplicate data
- [ ] Verify constraints enforced
- [ ] Verify indexes created successfully
- [ ] Verify view returns correct data
- [ ] Monitor query performance
- [ ] Monitor lock times on large tables

### Integration Testing

- [ ] Admin endpoints work with new permissions
- [ ] Version increments on concurrent updates
- [ ] Refund workflow end-to-end
- [ ] RMA workflow end-to-end
- [ ] Multi-item checkout works
- [ ] Old single-item orders still work

## Deployment Checklist

- [ ] Database backup taken
- [ ] Backup verified restorable
- [ ] Migrations reviewed by DBA/senior dev
- [ ] Emergency rollback plan prepared
- [ ] Team notified of maintenance window
- [ ] Monitoring alerts configured
- [ ] Deployment scripts tested in staging
- [ ] Deployment completed
- [ ] All tests pass on prod schema
- [ ] Team debriefed

## Status Tracking

| Migration | Status | Date | Notes |
|-----------|--------|------|-------|
| 019 - RBAC Permissions | 🔴 Not Started | - | Ready to implement |
| 020 - Version Control | 🔴 Not Started | - | Ready to implement |
| 021 - Refund Flow | 🔴 Not Started | - | Ready to implement |
| 022 - RMA Workflow | 🔴 Not Started | - | Ready to implement |
| 023 - Multi-Item | 🔴 Not Started | - | Ready to implement |

