# Critical Issues Implementation Plan - Vura Market Admin System

## Executive Summary

This document outlines the detailed implementation plan for fixing 5 critical issues in the Vura Market admin system. The issues affect core business operations including authorization, data consistency, financial workflows, and product management. Each issue is prioritized by business impact and dependencies.

**Priority Order:** 1 → 2 → 3 → 4 → 5 (issues can be worked in parallel where dependencies don't exist)

---

## Issue 1: Missing Permission Checks on Admin Endpoints

**Priority:** CRITICAL (P0)
**Business Impact:** HIGH - Without proper authorization checks, non-admin users could potentially access sensitive operations
**Effort:** Medium
**Dependencies:** None
**Risk:** Low (pure additive changes to existing auth flow)

### Current State Analysis

- `requireAdminPermission()` function exists in `api/_lib/auth.ts` and uses database-backed permission checks
- Admin endpoints exist but many lack explicit permission validation
- RBAC system is in place (admin_user_roles, admin_role_permissions, admin_permissions tables)
- Permission system uses SQL: `has_admin_permission(user_id, permission_code)`

### Endpoints Requiring Permission Checks

| Endpoint | Current State | Required Permission | Severity |
|----------|---------------|-------------------|----------|
| `GET /admin?resource=overview` | No explicit check (only requireAdmin) | `dashboard.read` | HIGH |
| `GET /admin?resource=products` | No explicit check | `products.read` | HIGH |
| `POST /admin?resource=products` | No explicit check | `products.create` | HIGH |
| `PATCH /admin?resource=products` | No explicit check | `products.write` | HIGH |
| `GET /admin?resource=suppliers` | No explicit check | `suppliers.read` | HIGH |
| `POST /admin?resource=suppliers` | No explicit check | `suppliers.create` | HIGH |
| `PATCH /admin?resource=suppliers` | No explicit check | `suppliers.write` | HIGH |
| `GET /admin?resource=orders` | No explicit check | `orders.read` | HIGH |
| `PATCH /admin?resource=orders` | No explicit check | `orders.write` | HIGH |
| `GET /admin?resource=delivery` | ✅ Has check | `orders.read`/`orders.write` | DONE |
| `POST /admin?resource=delivery` | ✅ Has check | `orders.write` | DONE |
| `PATCH /admin?resource=delivery` | ✅ Has check | `orders.write` | DONE |
| `GET /admin?resource=finance` | ✅ Has check | `finance.read` | DONE |
| `GET /admin?resource=refunds` | ✅ Has check | `finance.read` | DONE |
| `POST /admin?resource=refunds` | ✅ Has check | `refunds.create` | DONE |
| `PATCH /admin?resource=refunds` | ✅ Has check | `refunds.create` | DONE |

### Database Schema Required

The permission system is already in place:
```sql
-- These tables exist and are seeded
admin_permissions(id, code, name, description)
admin_roles(id, name)
admin_role_permissions(role_id, permission_id)
admin_user_roles(user_id, role_id)
```

### Implementation Tasks

#### 1.1 Add Permission Checks to Overview Handler
- **File:** `api/admin.ts` - `overview()` function
- **Change:** Call `requireAdminPermission(req, res, 'dashboard.read')` at handler start
- **Tests:** Verify unauthorized users get 403

#### 1.2 Add Permission Checks to Products Handlers
- **File:** `api/admin.ts` - `products()` function
- **Changes:**
  - GET: Add `requireAdminPermission(req, res, 'products.read')`
  - POST: Add `requireAdminPermission(req, res, 'products.create')`
  - PATCH: Add `requireAdminPermission(req, res, 'products.write')`
- **Tests:** Test each method separately with/without permissions

#### 1.3 Add Permission Checks to Suppliers Handlers
- **File:** `api/admin.ts` - `suppliers()` function
- **Changes:**
  - GET: Add `requireAdminPermission(req, res, 'suppliers.read')`
  - POST: Add `requireAdminPermission(req, res, 'suppliers.create')`
  - PATCH: Add `requireAdminPermission(req, res, 'suppliers.write')`
- **Tests:** Verify permission boundaries

#### 1.4 Add Permission Checks to Orders Handlers
- **File:** `api/admin.ts` - `orders()` function
- **Changes:**
  - GET: Add `requireAdminPermission(req, res, 'orders.read')`
  - PATCH: Add `requireAdminPermission(req, res, 'orders.write')`
- **Tests:** Verify payment status updates require explicit permission

#### 1.5 Add Permission Checks to Customers & Categories Handlers
- **File:** `api/admin.ts` - `customers()`, `categories()`, `notifications()` functions
- **Change:** Add appropriate permission checks (read-only)
- **Tests:** Verify consistent permission model

### Database Migrations Required

None - permission tables already exist. Just need to ensure permissions are seeded.

**Verify existing permissions in `db/migrations/007_rbac_foundation.sql` or later:**
- dashboard.read
- products.read, products.create, products.write
- suppliers.read, suppliers.create, suppliers.write
- orders.read, orders.write
- finance.read
- refunds.create

If missing, create new migration:
```sql
-- Migration: 019_rbac_permissions_seed.sql
INSERT INTO admin_permissions(code, name, description) VALUES
  ('dashboard.read', 'View Dashboard', 'Read dashboard overview and analytics'),
  ('products.read', 'Read Products', 'View product listings'),
  ('products.create', 'Create Products', 'Create new products'),
  ('products.write', 'Update Products', 'Modify existing products'),
  ('suppliers.read', 'Read Suppliers', 'View supplier information'),
  ('suppliers.create', 'Create Suppliers', 'Create new suppliers'),
  ('suppliers.write', 'Update Suppliers', 'Modify supplier information'),
  ('orders.read', 'Read Orders', 'View order details'),
  ('orders.write', 'Update Orders', 'Modify order status and details'),
  ('finance.read', 'Read Finance', 'View financial reports and refunds'),
  ('refunds.create', 'Create Refunds', 'Create and approve refunds')
ON CONFLICT (code) DO NOTHING;
```

### Code Changes Example

**Before:**
```typescript
async function overview(res: VercelResponse) {
  const [products, orders, ...] = await Promise.all([...]);
  return json(res, 200, {...});
}
```

**After:**
```typescript
async function overview(req: VercelRequest, res: VercelResponse, adminId: string) {
  const admin = await requireAdminPermission(req, res, 'dashboard.read');
  if (!admin) return;
  const [products, orders, ...] = await Promise.all([...]);
  return json(res, 200, {...});
}

// In handlers map:
overview: { GET: (req, res, adminId) => overview(req, res, adminId) },
```

### Testing Strategy

1. **Unit Tests:** Each permission check returns 403 when permission missing
2. **Integration Tests:** Admin with role "owner" can access all endpoints
3. **Regression Tests:** Existing authorized operations still work
4. **Edge Cases:** Test with multiple roles, permission inheritance

---

## Issue 2: No Concurrent Edit Protection (Order Version Control)

**Priority:** CRITICAL (P0)
**Business Impact:** HIGH - Concurrent edits can cause inconsistent order state
**Effort:** Medium
**Dependencies:** None
**Risk:** Medium (requires migrations and careful conflict handling)

### Current State Analysis

- Orders table has NO version column
- No optimistic locking implementation
- Concurrent PATCH requests can overwrite each other's changes
- Admin operations might conflict with automatic state transitions (fulfillment webhooks)

### Scenarios Where Conflicts Occur

1. Admin updating order status while payment webhook confirms payment
2. Multiple admins editing order costs simultaneously
3. Fulfillment status update conflicts with admin sourcing status change
4. Delivery webhook updating fulfillment while admin changes delivery details

### Database Changes Required

#### Migration: `020_order_version_control.sql`

```sql
-- Add version column to orders for optimistic locking
ALTER TABLE orders ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- Add unique constraint on order+version for conflict detection
CREATE INDEX IF NOT EXISTS orders_version_idx ON orders(id, version);

-- Add version column to order_fulfillments for fulfillment updates
ALTER TABLE order_fulfillments ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
```

### API Changes Required

#### 2.1 Update Order PATCH Handler to Support Versioning

**File:** `api/admin.ts` - `orders()` PATCH handler

**Changes:**
```typescript
// Request body must include version
{
  orderId: string,
  version?: number,  // Optional for backward compatibility, but recommended
  status?: string,
  paymentStatus?: string,
  sourcingStatus?: string,
  ...
}

// Response must include updated version
{
  order: {
    id: string,
    version: number,
    status: string,
    ...
  }
}
```

**Implementation:**
```typescript
// Existing query:
const updated = await sql`UPDATE orders SET ... WHERE id=${orderId} RETURNING ...`;

// New query with version check:
const updated = await sql`
  UPDATE orders 
  SET status=${nextStatus}, version=version+1, ...
  WHERE id=${orderId} AND (${body.version} IS NULL OR version=${body.version})
  RETURNING id, version, status, ...
`;

if (!updated[0]) {
  // Check if order exists but version mismatch
  const existing = await sql`SELECT version FROM orders WHERE id=${orderId}`;
  if (existing[0]) {
    return json(res, 409, { 
      error: 'Order was modified by another operation. Please refresh and try again.',
      currentVersion: existing[0].version
    });
  }
  return json(res, 404, { error: 'Order not found.' });
}
```

#### 2.2 Update Fulfillment PATCH Handler for Versioning

**File:** `api/admin.ts` - `delivery()` PATCH handler

**Similar implementation for order_fulfillments**

### UI Changes Required

#### Vura Studio OrderActionPanel Component

**File:** `src/pages/studio/OrderActionPanel.tsx`

**Changes:**
```typescript
interface OrderData {
  id: string;
  version: number;  // Add this
  status: string;
  paymentStatus: string;
  // ... other fields
}

async function handleStatusChange(newStatus: string) {
  try {
    const response = await updateOrder({
      orderId: order.id,
      version: order.version,  // Include current version
      status: newStatus,
    });
    
    if (response.status === 409) {
      // Conflict: show user-friendly message
      toast.error('This order was updated by someone else. Reloading...');
      await reloadOrder();
      return;
    }
    
    // Update local version
    order.version = response.order.version;
    setOrder(response.order);
  } catch (error) {
    if (error.status === 409) {
      // Handle conflict
    }
    throw error;
  }
}
```

### Testing Strategy

1. **Concurrent Update Tests:** Simulate two PATCH requests simultaneously
   - First succeeds with version 1 → 2
   - Second fails with 409 Conflict (old version 1)
   - Response includes current version
   
2. **Version Increment Tests:** Each successful update increments version

3. **Backward Compatibility Tests:** Requests without version still work

4. **Fulfillment Conflict Tests:** Webhook updating fulfillment status conflicts with admin updates

### Risk Mitigation

- **Backward Compatible:** Version parameter is optional
- **No Data Loss:** Conflict tells client to refresh and retry
- **Audit Trail:** Include version in audit log for debugging
- **Monitoring:** Track 409 conflict rates to identify problematic workflows

---

## Issue 3: Refund Processing Incomplete

**Priority:** CRITICAL (P0)
**Business Impact:** CRITICAL - Refunds stuck in processing, customers not notified
**Effort:** High
**Dependencies:** Issue 1 (permissions), Issue 2 (versioning helpful but not required)
**Risk:** High (financial data, requires careful state transitions)

### Current State Analysis

- Refunds table exists with states: `requested → approved → processing → completed → rejected/failed`
- Current implementation stops at `approved` state
- Missing: `processing → completed` state transition
- Missing: Ledger entries when refund completes
- Missing: Customer notification when refund is completed
- Missing: Refund reversal/failure handling

### Database Tables Involved

```
refunds(id, order_id, payment_transaction_id, amount_kobo, status, ...)
ledger_accounts(id, code, name, account_type)
ledger_entries(id, transaction_id, order_id, account_id, entry_type, amount_kobo, ...)
payment_transactions(id, order_id, amount_kobo, status, ...)
```

### State Diagram

```
requested → approved → processing → completed
                          ↓
                        failed/rejected
```

### Database Changes Required

#### Migration: `021_refund_completion_flow.sql`

```sql
-- Add columns to track refund processing
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS processed_at timestamptz;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS failed_at timestamptz;
ALTER TABLE refunds ADD COLUMN IF NOT EXISTS failure_reason text;

-- Ledger posting already exists in 009_financial_refund_ledger.sql
-- but needs to be called explicitly from processing endpoint

-- Add function to complete refund with ledger posting
CREATE OR REPLACE FUNCTION complete_refund(
  p_refund_id uuid,
  p_actor_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  r refunds%ROWTYPE;
  result jsonb;
BEGIN
  SELECT * INTO r FROM refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REFUND_NOT_FOUND'; END IF;
  IF r.status NOT IN ('approved', 'processing') THEN 
    RAISE EXCEPTION 'REFUND_INVALID_STATUS:%', r.status;
  END IF;

  -- Update refund to completed
  UPDATE refunds
  SET status = 'completed',
      completed_at = now(),
      processed_at = COALESCE(processed_at, now()),
      updated_at = now()
  WHERE id = p_refund_id
  RETURNING * INTO r;

  -- Post ledger entries
  PERFORM post_refund_ledger(p_refund_id, p_actor_user_id);

  RETURN jsonb_build_object(
    'refund_id', r.id,
    'order_id', r.order_id,
    'amount_kobo', r.amount_kobo,
    'status', r.status,
    'completed_at', r.completed_at
  );
END;
$$;

-- Add function to reject/fail refund
CREATE OR REPLACE FUNCTION fail_refund(
  p_refund_id uuid,
  p_reason text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  r refunds%ROWTYPE;
BEGIN
  SELECT * INTO r FROM refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REFUND_NOT_FOUND'; END IF;
  IF r.status NOT IN ('approved', 'processing') THEN 
    RAISE EXCEPTION 'REFUND_INVALID_STATUS:%', r.status;
  END IF;

  UPDATE refunds
  SET status = 'failed',
      failure_reason = COALESCE(p_reason, 'No reason provided'),
      failed_at = now(),
      updated_at = now()
  WHERE id = p_refund_id
  RETURNING * INTO r;

  RETURN jsonb_build_object(
    'refund_id', r.id,
    'status', r.status,
    'reason', r.failure_reason
  );
END;
$$;
```

### API Changes Required

#### 3.1 Add Refund Processing Endpoint

**File:** `api/admin.ts` - `refunds()` handler - new action

**Add handler for:**
```typescript
// PATCH /admin?resource=refunds
{
  action: 'refund_process',  // New action type
  refundId: string,
}
```

**Implementation:**
```typescript
if (req.method === 'PATCH' && body.action === 'refund_process') {
  if (typeof body.refundId !== 'string') 
    return json(res, 400, { error: 'Refund is required.' });

  const existing = await sql`
    SELECT r.id, r.order_id, r.amount_kobo, r.status, 
           o.buyer_id, u.email, u.name
    FROM refunds r
    JOIN orders o ON o.id = r.order_id
    JOIN users u ON u.id = o.buyer_id
    WHERE r.id = ${body.refundId} LIMIT 1
  `;
  
  if (!existing[0]) 
    return json(res, 404, { error: 'Refund not found.' });
  if (existing[0].status !== 'approved') 
    return json(res, 409, { 
      error: `Refund cannot be processed from ${existing[0].status} status.` 
    });

  // Complete the refund (posts ledger entries)
  const result = await sql`SELECT complete_refund(${body.refundId}, ${admin.id}) AS result`;
  
  // Fetch updated refund
  const updated = await sql`SELECT * FROM refunds WHERE id = ${body.refundId}`;
  
  // Record audit
  await recordAudit({ 
    actorUserId: admin.id, 
    action: 'refund.completed', 
    entityType: 'refund', 
    entityId: body.refundId, 
    beforeData: existing[0], 
    afterData: updated[0],
    metadata: { orderNumber: existing[0].order_number }
  });

  // Notify customer
  const email = simpleOrderEmail(
    'Refund Processed - Vura Market',
    existing[0].name,
    existing[0].order_id,
    `Your refund of ₦${(existing[0].amount_kobo / 100).toFixed(2)} has been processed and should appear in your account within 1-2 business days.`
  );
  
  await notifyUser({
    userId: existing[0].buyer_id,
    email: existing[0].email,
    firstName: existing[0].name,
    orderId: existing[0].order_id,
    eventType: 'refund.completed',
    title: 'Refund Processed',
    body: `Your refund of ₦${(existing[0].amount_kobo / 100).toFixed(2)} is being processed.`,
    subject: email.subject,
    text: email.text,
    html: email.html
  });

  await recordOrderEvent({
    actorUserId: admin.id,
    orderId: existing[0].order_id,
    eventType: 'refund_processed',
    metadata: { refundId: body.refundId, amountKobo: existing[0].amount_kobo }
  });

  return json(res, 200, { refund: updated[0] });
}
```

#### 3.2 Add Refund Rejection Endpoint

**Similar to processing but handles failure case:**
```typescript
if (req.method === 'PATCH' && body.action === 'refund_reject') {
  if (typeof body.refundId !== 'string') 
    return json(res, 400, { error: 'Refund is required.' });
  
  const reason = typeof body.reason === 'string' ? body.reason.trim() : 'Rejected by admin';
  
  // Call fail_refund function
  const result = await sql`SELECT fail_refund(${body.refundId}, ${reason}, ${admin.id})`;
  
  // Notify customer
  // Record audit
  // Record event
  
  return json(res, 200, { refund: updated[0] });
}
```

### UI Changes Required

#### Vura Studio Finance/Refunds Component

**File:** `src/pages/studio/FinanceView.tsx` (or refunds panel)

**Add columns/actions:**
- Refund status display (requested, approved, processing, completed, failed)
- Action buttons: "Process Refund" (for approved), "Reject Refund"
- Show processing time and who approved/completed
- Handle 409 conflicts from version control

### Tests to Implement

1. **Happy Path:** refund: approved → processing → completed
   - Verify ledger entries created
   - Verify customer notification sent
   - Verify order events logged

2. **Rejection Flow:** approved → failed
   - Verify failure reason stored
   - Verify customer notified of rejection
   - Verify no ledger entries posted

3. **Idempotency:** Processing same refund twice is safe
   - Second call returns same result or 409

4. **Permissions:** Only users with `refunds.create` can process

5. **Error Handling:**
   - Cannot process non-approved refund
   - Cannot process non-existent refund
   - Handles database errors gracefully

---

## Issue 4: RMA Workflow Incomplete

**Priority:** CRITICAL (P0)
**Business Impact:** CRITICAL - Return orders stuck, customers cannot get replacements/refunds
**Effort:** High
**Dependencies:** Issue 1 (permissions), Issue 3 (refund completion)
**Risk:** High (complex workflow, inventory implications)

### Current State Analysis

- RMA (Return Merchandise Authorization) table exists with states
- Current states: `requested → approved` (stuck here)
- Missing: `approved → return_in_transit → received → inspecting → (refunded|replaced|rejected)`
- Missing: Inspection workflow
- Missing: Replacement vs refund decision logic
- Missing: Inventory restock for accepted returns
- Missing: Replacement fulfillment creation

### Database Tables Involved

```
return_requests(id, rma_number, order_id, status, ...)
return_items(id, return_request_id, product_id, variant_id, quantity)
refunds(id, order_id, amount_kobo, status, ...)
product_variants(id, available_quantity, reserved_quantity, ...)
order_fulfillments(id, order_id, status, ...)
```

### State Diagram

```
requested
    ↓
approved
    ↓
return_in_transit (customer ships back)
    ↓
received (at warehouse)
    ↓
inspecting
    ↓
├→ refunded (damage/defect confirmed) → inventory restocked
├→ replaced (issue confirmed) → new fulfillment created
└→ rejected (not returnable/customer damaged) → inventory restocked
```

### Database Changes Required

#### Migration: `022_rma_inspection_workflow.sql`

```sql
-- Add inspection tracking to return_requests
ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS 
  received_at timestamptz;
ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS 
  inspection_started_at timestamptz;
ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS 
  inspection_notes text;
ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS 
  inspection_decision text;  -- 'refund', 'replace', 'reject'
ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS 
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS 
  decided_at timestamptz;
ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS 
  replacement_order_id uuid REFERENCES orders(id) ON DELETE SET NULL;

-- Add columns for tracking approval
ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS 
  approved_at timestamptz;
ALTER TABLE return_requests ADD COLUMN IF NOT EXISTS 
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL;

-- Add event/audit trail for RMA status changes
CREATE TABLE IF NOT EXISTS rma_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_request_id uuid NOT NULL REFERENCES return_requests(id) ON DELETE CASCADE,
  event_type text NOT NULL,  -- received, inspecting, completed
  from_status text,
  to_status text,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rma_events_rma_idx ON rma_events(return_request_id, created_at DESC);

-- Update completion function to handle all three outcomes
CREATE OR REPLACE FUNCTION complete_rma_with_outcome(
  p_return_request_id uuid,
  p_decision text,  -- 'refund', 'replace', 'reject'
  p_inspection_notes text DEFAULT NULL,
  p_actor_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  r return_requests%ROWTYPE;
  o orders%ROWTYPE;
  refund_id uuid;
  result jsonb;
  final_status text;
BEGIN
  IF p_decision NOT IN ('refund', 'replace', 'reject') THEN
    RAISE EXCEPTION 'INVALID_RMA_DECISION';
  END IF;

  SELECT * INTO r FROM return_requests WHERE id = p_return_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RMA_NOT_FOUND'; END IF;
  IF r.status NOT IN ('inspecting', 'received') THEN 
    RAISE EXCEPTION 'RMA_INVALID_STATUS:%', r.status;
  END IF;

  SELECT * INTO o FROM orders WHERE id = r.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;

  -- Handle the decision
  IF p_decision = 'refund' THEN
    final_status := 'refunded';
    
    -- Create refund for full order amount
    INSERT INTO refunds(
      order_id, amount_kobo, reason, status,
      requested_by, approved_by, approved_at
    ) VALUES (
      r.order_id,
      o.total_kobo,
      'RMA refund - ' || p_inspection_notes,
      'approved',  -- Auto-approve for RMA
      p_actor_user_id,
      p_actor_user_id,
      now()
    ) RETURNING id INTO refund_id;

    -- Complete the refund
    PERFORM complete_refund(refund_id, p_actor_user_id);

    -- Restock inventory
    PERFORM reconcile_return_inventory(p_return_request_id, p_actor_user_id);

  ELSIF p_decision = 'replace' THEN
    final_status := 'replaced';
    
    -- Create replacement order (with same product/quantity)
    -- This is complex - leave for separate function or manual creation
    -- Restock inventory
    PERFORM reconcile_return_inventory(p_return_request_id, p_actor_user_id);

  ELSIF p_decision = 'reject' THEN
    final_status := 'rejected';
    
    -- Restock inventory (customer damaged, not our fault)
    PERFORM reconcile_return_inventory(p_return_request_id, p_actor_user_id);
  END IF;

  -- Update RMA status
  UPDATE return_requests
  SET status = final_status,
      inspection_notes = COALESCE(p_inspection_notes, inspection_notes),
      inspection_decision = p_decision,
      decided_by = p_actor_user_id,
      decided_at = now(),
      updated_at = now()
  WHERE id = p_return_request_id
  RETURNING * INTO r;

  RETURN jsonb_build_object(
    'rma_id', r.id,
    'rma_number', r.rma_number,
    'status', r.status,
    'decision', p_decision,
    'refund_id', CASE WHEN p_decision = 'refund' THEN refund_id ELSE NULL END
  );
END;
$$;

-- Function to mark RMA as received at warehouse
CREATE OR REPLACE FUNCTION mark_rma_received(
  p_return_request_id uuid,
  p_actor_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  r return_requests%ROWTYPE;
BEGIN
  SELECT * INTO r FROM return_requests 
  WHERE id = p_return_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RMA_NOT_FOUND'; END IF;
  IF r.status NOT IN ('return_in_transit', 'approved') THEN 
    RAISE EXCEPTION 'RMA_INVALID_STATUS_FOR_RECEIVE:%', r.status;
  END IF;

  UPDATE return_requests
  SET status = 'received',
      received_at = now(),
      updated_at = now()
  WHERE id = p_return_request_id
  RETURNING * INTO r;

  INSERT INTO rma_events(
    return_request_id, event_type, from_status, to_status,
    actor_user_id, metadata
  ) VALUES (
    r.id, 'received', 'return_in_transit', 'received',
    p_actor_user_id, jsonb_build_object()
  );

  RETURN jsonb_build_object(
    'rma_id', r.id,
    'status', r.status,
    'received_at', r.received_at
  );
END;
$$;

-- Function to start inspection
CREATE OR REPLACE FUNCTION start_rma_inspection(
  p_return_request_id uuid,
  p_actor_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  r return_requests%ROWTYPE;
BEGIN
  SELECT * INTO r FROM return_requests 
  WHERE id = p_return_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RMA_NOT_FOUND'; END IF;
  IF r.status NOT IN ('received') THEN 
    RAISE EXCEPTION 'RMA_INVALID_STATUS_FOR_INSPECT:%', r.status;
  END IF;

  UPDATE return_requests
  SET status = 'inspecting',
      inspection_started_at = now(),
      updated_at = now()
  WHERE id = p_return_request_id
  RETURNING * INTO r;

  INSERT INTO rma_events(
    return_request_id, event_type, from_status, to_status,
    actor_user_id, metadata
  ) VALUES (
    r.id, 'inspecting_started', 'received', 'inspecting',
    p_actor_user_id, jsonb_build_object()
  );

  RETURN jsonb_build_object(
    'rma_id', r.id,
    'status', r.status,
    'inspection_started_at', r.inspection_started_at
  );
END;
$$;
```

### API Changes Required

#### 4.1 Add RMA Receive Endpoint

**File:** `api/admin.ts` - `refunds()` handler - new action

```typescript
if (req.method === 'PATCH' && body.action === 'rma_receive') {
  if (typeof body.rmaId !== 'string') 
    return json(res, 400, { error: 'RMA is required.' });

  const existing = await sql`
    SELECT r.*, o.order_number 
    FROM return_requests r
    JOIN orders o ON o.id = r.order_id
    WHERE r.id = ${body.rmaId} LIMIT 1
  `;
  
  if (!existing[0]) 
    return json(res, 404, { error: 'RMA not found.' });
  if (!['return_in_transit', 'approved'].includes(existing[0].status)) 
    return json(res, 409, { 
      error: `RMA cannot be received from ${existing[0].status} status.` 
    });

  const result = await sql`
    SELECT mark_rma_received(${body.rmaId}, ${admin.id}) AS result
  `;

  const updated = await sql`
    SELECT * FROM return_requests WHERE id = ${body.rmaId}
  `;

  await recordAudit({ 
    actorUserId: admin.id, 
    action: 'rma.received', 
    entityType: 'rma', 
    entityId: body.rmaId, 
    beforeData: existing[0], 
    afterData: updated[0]
  });

  return json(res, 200, { rma: updated[0] });
}
```

#### 4.2 Add RMA Inspection Start Endpoint

```typescript
if (req.method === 'PATCH' && body.action === 'rma_inspect') {
  if (typeof body.rmaId !== 'string') 
    return json(res, 400, { error: 'RMA is required.' });

  const existing = await sql`SELECT * FROM return_requests WHERE id = ${body.rmaId}`;
  if (!existing[0]) return json(res, 404, { error: 'RMA not found.' });
  if (existing[0].status !== 'received') 
    return json(res, 409, { error: `RMA must be received before inspection.` });

  const result = await sql`SELECT start_rma_inspection(${body.rmaId}, ${admin.id})`;
  const updated = await sql`SELECT * FROM return_requests WHERE id = ${body.rmaId}`;

  await recordAudit({ 
    actorUserId: admin.id, 
    action: 'rma.inspection_started', 
    entityType: 'rma', 
    entityId: body.rmaId 
  });

  return json(res, 200, { rma: updated[0] });
}
```

#### 4.3 Add RMA Inspection Outcome Endpoint (Most Critical)

```typescript
if (req.method === 'PATCH' && body.action === 'rma_complete') {
  if (typeof body.rmaId !== 'string' || typeof body.decision !== 'string') 
    return json(res, 400, { 
      error: 'RMA and decision (refund|replace|reject) are required.' 
    });
  
  if (!['refund', 'replace', 'reject'].includes(body.decision)) 
    return json(res, 400, { error: 'Invalid decision. Must be refund, replace, or reject.' });

  const existing = await sql`
    SELECT r.*, o.order_number, o.buyer_id, u.email, u.name
    FROM return_requests r
    JOIN orders o ON o.id = r.order_id
    JOIN users u ON u.id = o.buyer_id
    WHERE r.id = ${body.rmaId} LIMIT 1
  `;
  
  if (!existing[0]) 
    return json(res, 404, { error: 'RMA not found.' });
  if (existing[0].status !== 'inspecting') 
    return json(res, 409, { 
      error: `RMA must be in inspecting status. Current: ${existing[0].status}` 
    });

  const result = await sql`
    SELECT complete_rma_with_outcome(
      ${body.rmaId}, 
      ${body.decision},
      ${typeof body.inspectionNotes === 'string' ? body.inspectionNotes : null},
      ${admin.id}
    ) AS result
  `;

  const updated = await sql`SELECT * FROM return_requests WHERE id = ${body.rmaId}`;

  await recordAudit({ 
    actorUserId: admin.id, 
    action: `rma.completed.${body.decision}`, 
    entityType: 'rma', 
    entityId: body.rmaId, 
    beforeData: existing[0], 
    afterData: updated[0],
    metadata: { decision: body.decision, notes: body.inspectionNotes }
  });

  // Notify customer of outcome
  let title, message;
  if (body.decision === 'refund') {
    title = 'RMA Approved - Refund Processing';
    message = `Your return (RMA #${existing[0].rma_number}) has been received and inspected. Your refund is being processed and should appear within 1-2 business days.`;
  } else if (body.decision === 'replace') {
    title = 'RMA Approved - Replacement Shipping';
    message = `Your return (RMA #${existing[0].rma_number}) has been approved for replacement. We will ship your replacement item shortly.`;
  } else {
    title = 'RMA Review Complete';
    message = `Your return (RMA #${existing[0].rma_number}) has been reviewed. Unfortunately, it does not qualify for replacement under our return policy.`;
  }

  const email = simpleOrderEmail(title, existing[0].name, existing[0].order_number, message);
  await notifyUser({
    userId: existing[0].buyer_id,
    email: existing[0].email,
    firstName: existing[0].name,
    orderId: existing[0].order_id,
    eventType: `rma.completed.${body.decision}`,
    title: title,
    body: message,
    subject: email.subject,
    text: email.text,
    html: email.html
  });

  await recordOrderEvent({
    actorUserId: admin.id,
    orderId: existing[0].order_id,
    eventType: `rma_${body.decision}`,
    toStatus: updated[0].status,
    metadata: { 
      rmaId: body.rmaId, 
      rmaNumber: existing[0].rma_number,
      decision: body.decision 
    }
  });

  return json(res, 200, { rma: updated[0] });
}
```

### UI Changes Required

#### Vura Studio RMA Management Panel

**File:** New or updated `src/pages/studio/RmaManagementPanel.tsx`

**Display:**
- RMA list filtered by status
- State transition buttons: Receive → Inspect → Complete
- Inspection form with:
  - Decision dropdown (Refund / Replace / Reject)
  - Inspection notes textarea
  - Submit button
- Show RMA events/history
- Customer notification status

### Tests to Implement

1. **Happy Path - Refund:**
   - RMA: approved → return_in_transit → received → inspecting → refunded
   - Verify refund created and completed
   - Verify inventory restocked
   - Verify customer notified

2. **Happy Path - Reject:**
   - RMA: approved → return_in_transit → received → inspecting → rejected
   - Verify inventory restocked
   - Verify customer notified of rejection

3. **Replacement Flow:**
   - RMA approved for replace
   - Verify new fulfillment created
   - Verify customer notified

4. **Invalid State Transitions:**
   - Cannot move to inspecting if not received
   - Cannot complete if not inspecting
   - Cannot complete with invalid decision

5. **Permissions:** Only users with refund.create permission can complete RMA

---

## Issue 5: Multi-Item Orders Not Supported

**Priority:** HIGH (P1 - depends on 1-4)
**Business Impact:** MEDIUM - Limits customer ability to purchase multiple items
**Effort:** High (architectural change)
**Dependencies:** Issues 1-4 (complete first for stability)
**Risk:** High (fundamental model change, impacts all order workflows)

### Current State Analysis

```sql
-- Current orders table (simplified):
orders(
  id, buyer_id, product_id (SINGLE), quantity,
  total_kobo, status, ...
)

-- Problem: One product per order, can't buy multiple products together
```

- Orders hardcoded to single `product_id` column
- No cart model
- No `order_items` table
- Fulfillment logic assumes single product
- Refund logic assumes single product
- RMA logic assumes single product

### Proposed Data Model

```sql
-- New tables:
carts(id, buyer_id, expires_at, ...)
cart_items(id, cart_id, product_id, quantity, price_kobo, ...)
order_items(id, order_id, product_id, quantity, unit_price_kobo, total_kobo, ...)

-- Modified orders table:
orders(id, buyer_id, total_kobo, status, ...) 
-- Removed: product_id, quantity (now via order_items)
-- Added: item_count, unique constraint on buyer+created_at might be added
```

### Database Changes Required

#### Migration: `023_multi_item_cart_model.sql`

```sql
BEGIN;

-- Shopping cart support
CREATE TABLE IF NOT EXISTS carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active',  -- active, abandoned, checked_out, expired
  expires_at timestamptz NOT NULL,
  checkout_started_at timestamptz,
  checked_out_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cart_status_check CHECK (status IN ('active','abandoned','checked_out','expired'))
);

CREATE INDEX IF NOT EXISTS carts_buyer_active_idx 
  ON carts(buyer_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS carts_expires_idx ON carts(expires_at);

-- Cart line items
CREATE TABLE IF NOT EXISTS cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0 AND quantity <= 100),
  price_kobo bigint NOT NULL CHECK (price_kobo > 0),
  variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cart_id, product_id)  -- One product per cart
);

CREATE INDEX IF NOT EXISTS cart_items_cart_idx ON cart_items(cart_id);

-- Order line items
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_kobo bigint NOT NULL CHECK (unit_price_kobo > 0),
  total_kobo bigint NOT NULL CHECK (total_kobo > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_items_total_check CHECK (total_kobo = unit_price_kobo * quantity)
);

CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);
CREATE INDEX IF NOT EXISTS order_items_product_idx ON order_items(product_id);

-- Modify orders table to support multi-item
-- NOTE: This is BREAKING - need careful migration strategy
ALTER TABLE orders 
  DROP CONSTRAINT IF EXISTS orders_product_id_fkey;
  -- Keep product_id column for backward compatibility (nullable)
  -- or migrate to order_items for new orders

ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS item_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cart_id uuid REFERENCES carts(id) ON DELETE SET NULL;

-- View for backward compatibility - shows first item as "product"
CREATE OR REPLACE VIEW order_with_product AS
SELECT 
  o.*,
  oi.product_id,
  oi.quantity,
  oi.unit_price_kobo
FROM orders o
LEFT JOIN (
  SELECT DISTINCT ON (order_id) 
    order_id, product_id, quantity, unit_price_kobo
  FROM order_items
  ORDER BY order_id, created_at
) oi ON oi.order_id = o.id;

COMMIT;
```

### API Changes Required (High Risk)

#### 5.1 Create/Update Cart Endpoints

New file: `api/cart/index.ts`

```typescript
// GET /api/cart - Get current cart
// POST /api/cart - Create/get active cart
// PATCH /api/cart - Update cart status

// GET /api/cart/items - List cart items
// POST /api/cart/items - Add to cart
// PATCH /api/cart/items/{itemId} - Update quantity
// DELETE /api/cart/items/{itemId} - Remove from cart
```

#### 5.2 Modify Checkout to Use Multi-Item Orders

File: `api/commerce.ts` (or new checkout handler)

**Current:**
```typescript
// Single product checkout
const order = await sql`
  INSERT INTO orders(buyer_id, product_id, quantity, total_kobo, ...)
  VALUES(${buyerId}, ${productId}, ${qty}, ${total}, ...)
`;
```

**New:**
```typescript
// Multi-item checkout
const items = await sql`SELECT * FROM cart_items WHERE cart_id=${cartId}`;

const order = await sql`
  INSERT INTO orders(buyer_id, total_kobo, status, cart_id, item_count, ...)
  VALUES(${buyerId}, ${cartTotal}, 'awaiting_payment', ${cartId}, ${items.length}, ...)
  RETURNING *
`;

for (const item of items) {
  await sql`
    INSERT INTO order_items(order_id, product_id, quantity, unit_price_kobo, total_kobo)
    VALUES(${order.id}, ${item.product_id}, ${item.quantity}, ${item.price_kobo}, ...)
  `;
}

// Mark cart as checked out
await sql`UPDATE carts SET status='checked_out', checked_out_at=now() WHERE id=${cartId}`;
```

#### 5.3 Update Order Fulfillment for Multi-Item

Currently: One fulfillment per order (single product)

New: Multiple fulfillments possible (one per supplier or one per product)

```typescript
// Create fulfillments for each supplier
const suppliers = new Map();
const items = await sql`SELECT * FROM order_items WHERE order_id=${orderId}`;

for (const item of items) {
  const product = await getProduct(item.product_id);
  const supplier = product.supplier_id;
  
  if (!suppliers.has(supplier)) {
    suppliers.set(supplier, []);
  }
  suppliers.get(supplier).push(item);
}

// Create one fulfillment per supplier
for (const [supplierId, supplierItems] of suppliers) {
  const fulfillment = await sql`
    INSERT INTO order_fulfillments(order_id, supplier_id, ...)
    VALUES(${orderId}, ${supplierId}, ...)
    RETURNING id
  `;
  
  for (const item of supplierItems) {
    await sql`
      INSERT INTO fulfillment_items(fulfillment_id, product_id, quantity, ...)
      VALUES(${fulfillment.id}, ${item.product_id}, ${item.quantity}, ...)
    `;
  }
}
```

### UI Changes Required

#### Customer Shop Pages

**New Cart Page:** `src/customer/pages/CartPage.tsx`
- Display cart items with product images
- Update quantities
- Remove items
- Show total with taxes/fees
- Checkout button

#### Modify Checkout Flow

**Current:** Direct checkout from product page
**New:** Add to cart → Cart page → Checkout

#### Admin Order Management

Update `src/pages/studio/OrderActionPanel.tsx` to show:
- Multiple line items
- Per-item status (if fulfillments are per-supplier)
- Per-item refund capability
- Per-item RMA capability

### Migration Strategy (Critical)

This is a **breaking data model change**. Must be done carefully:

1. **Phase 1 (Add New Tables):** Create cart/order_items tables while keeping existing orders table intact
2. **Phase 2 (Dual Support):** New orders use order_items, old orders still use product_id
3. **Phase 3 (Backward Compat):** Use view (order_with_product) for old code
4. **Phase 4 (Migrate Legacy):** Migrate existing orders to new model (optional, can run in parallel)
5. **Phase 5 (Cleanup):** Eventually remove product_id column after legacy support deprecated

### Tests to Implement

1. **Cart Operations:**
   - Add to cart, update quantity, remove item
   - Cart expires after 48 hours
   - Cart checkout creates multi-item order

2. **Order Fulfillment:**
   - Multi-supplier order creates multiple fulfillments
   - Each fulfillment can be tracked separately

3. **Refunds:**
   - Can refund individual items
   - Can refund all items
   - Partial refund amounts calculated correctly

4. **RMA:**
   - Can return individual items
   - RMA covers multiple items or single item

5. **Inventory:**
   - Multiple items reserved when checking out
   - Inventory released if order cancelled

---

## Implementation Roadmap

### Phase 1: Permissions & Versioning (Week 1)
- **Issue 1:** Add permission checks (3-4 days)
- **Issue 2:** Implement order versioning (2-3 days)
- **Deliverable:** All admin endpoints protected with role-based access

### Phase 2: Financial Workflows (Week 2-3)
- **Issue 3:** Complete refund processing flow (4-5 days)
- **Issue 4:** Complete RMA inspection workflow (5-6 days)
- **Deliverable:** Customers can receive refunds and handle returns

### Phase 3: Multi-Item Support (Week 4-6)
- **Issue 5:** Implement cart and multi-item orders (8-10 days)
- **Deliverable:** Customers can purchase multiple items

### Total Effort
- **Development:** 3-4 weeks for complete implementation
- **Testing:** 1 week for comprehensive QA
- **Deployment:** Staged rollout with monitoring

---

## Risk Assessment & Mitigation

| Issue | Risk Level | Mitigation |
|-------|-----------|-----------|
| Permission Checks (1) | Low | Backward compatible, test existing flows |
| Versioning (2) | Medium | Gradual rollout, monitor conflict rates |
| Refund Processing (3) | High | Comprehensive testing, ledger verification |
| RMA Workflow (4) | High | End-to-end testing, customer communication |
| Multi-Item Orders (5) | High | Dual support mode, gradual migration |

---

## Success Criteria

1. ✅ All admin endpoints have permission checks
2. ✅ Concurrent order edits are protected (409 conflicts)
3. ✅ Refunds process end-to-end with ledger entries and customer notification
4. ✅ RMA workflow supports inspection and outcome decisions
5. ✅ Multi-item orders supported with flexible fulfillment

---

## References

- Database Migrations: `db/migrations/001-018_*.sql`
- Admin API: `api/admin.ts`
- Auth Library: `api/_lib/auth.ts`
- RBAC System: `db/migrations/007_rbac_foundation.sql`
- UI Components: `src/pages/studio/*`

