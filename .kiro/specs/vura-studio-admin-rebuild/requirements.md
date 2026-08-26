# Vura Studio Admin System - Complete Rebuild Requirements

## Project Status
- **Phase:** Requirements & Architecture Design
- **Scope:** Complete admin system redesign from broken state to production-ready operations platform
- **Priority:** CRITICAL (production failure)
- **Timeline:** Multi-phase implementation

---

## CRITICAL PRODUCTION ISSUE

### Root Cause
Production database has corrupted RBAC schema:
- All RBAC tables missing (admin_roles, admin_permissions, admin_user_roles, admin_role_permissions)
- `has_admin_permission()` function does not exist
- schema_migrations table shows migrations 001, 007, 019, 020 as applied, but never actually executed
- Result: ALL admin endpoints return HTTP 500 "The admin operation could not be completed"

### Current Frontend Failure Mode
ProductionStudioOps.tsx uses `Promise.all()` that fails globally:
- If ANY one endpoint (overview, orders, products, suppliers, notifications) fails
- ALL tabs become broken
- User sees generic "The admin operation could not be completed" error
- No ability to see which resource is actually failing

---

## PHASE 0: IMMEDIATE RECOVERY (Emergency Fix)

### Objective
Restore admin system to working state with proper error reporting.

### Tasks

#### 0.1: Database Schema Recovery
**Type:** Database migration repair  
**Blocking:** Everything else  
**Steps:**
1. Delete false migration records:
   ```sql
   DELETE FROM schema_migrations 
   WHERE version IN ('001', '007', '019', '020', '021', '024', '025', '026');
   ```
2. Run migration runner to rebuild schema:
   ```bash
   DATABASE_URL=... npm run db:migrate
   ```
3. Verify RBAC tables exist
4. Verify has_admin_permission() function exists
5. Verify admin permissions seeded
6. Verify admin users assigned to owner role

**Acceptance:** 
- [ ] admin_roles table has owner, manager, viewer, finance roles
- [ ] admin_permissions table has 18+ permission codes
- [ ] has_admin_permission() function callable
- [ ] All admin users have role assignments
- [ ] Test: SELECT has_admin_permission(<admin_id>, 'dashboard.read') returns true

---

#### 0.2: Permission Code Consistency Audit
**Type:** Code audit + potential migration  
**Blocking:** Until consistency determined  

**Current mismatches to resolve:**

| Endpoint | Permission Checked | Migration Seeded | Status |
|----------|-------------------|------------------|--------|
| /overview | dashboard.read | NOT SEEDED | ❌ |
| /products GET | products.read | NOT SEEDED | ❌ |
| /products POST | products.create | SEEDED in 020 | ✅ |
| /products PATCH | products.write | Seeded as products.update | ⚠️ |
| /orders GET | orders.read | NOT SEEDED | ❌ |
| /orders PATCH | orders.write | Seeded as orders.update | ⚠️ |
| /suppliers GET | suppliers.read | Seeded as suppliers.manage | ⚠️ |
| /categories GET | categories.read | NOT SEEDED | ❌ |
| /customers GET | customers.read | NOT SEEDED | ❌ |
| /notifications GET | notifications.read | NOT SEEDED | ❌ |
| /delivery | deliveries.read | NOT SEEDED | ❌ |
| /finance | finance.read | SEEDED | ✅ |
| /refunds | refunds.create | SEEDED | ✅ |

**Decision:** Standardize on kebab-case .write/.read/.create/.manage:
- products.read, products.create, products.write
- suppliers.read, suppliers.create, suppliers.write  
- orders.read, orders.write
- And so on...

**Migration:** Create migration 027_standardize_permission_codes.sql to:
1. Rename permissions to standard codes
2. Update has_admin_permission() function documentation if needed
3. Ensure all API permissions are seeded

**Acceptance:**
- [ ] All admin.ts permission codes exist in database
- [ ] No mismatches between API and database
- [ ] All roles have correct permissions assigned

---

#### 0.3: Improve Error Diagnostics
**Type:** Code change - API + Frontend  
**Blocking:** Until operators can see actual errors  

**Frontend Changes:**
1. Replace global Promise.all() with independent resource loading
2. Show per-resource error states instead of global failure
3. Distinguish between:
   - Authentication failed (401)
   - Permission denied (403)
   - Resource not found (404)
   - Server error (500)
   - Network offline

**Backend Changes:**
1. Add X-Request-ID header to all responses (for server-side logging correlation)
2. Log full SQL error stack server-side with request ID
3. Return safe client-side error message + request ID
4. Never expose SQL/secrets to browser

**New Endpoint:**
Add `/api/admin/health` endpoint that returns:
```json
{
  "status": "healthy" | "degraded" | "down",
  "database": "connected" | "failed",
  "rbac": "initialized" | "missing_tables" | "missing_functions",
  "migrations": { "count": N, "latest": "NNNN", "status": "applied" },
  "requiredFunctions": ["has_admin_permission", ...],
  "requiredTables": ["admin_roles", "admin_permissions", ...],
  "timestamp": "2026-08-26T...",
  "requestId": "abc-123"
}
```

**Acceptance:**
- [ ] Each admin resource loads independently
- [ ] Errors show specific problem, not generic message
- [ ] Request IDs available for debugging
- [ ] Health endpoint works and accurately reports state
- [ ] Test: One endpoint can fail without breaking others

---

## PHASE 1: ARCHITECTURE REDESIGN

### Objective
Build a scalable, resilient admin system with proper navigation and role-based access.

### 1.1: New Navigation Architecture

**Desktop Sidebar (Left 256px):**
```
VURA STUDIO
━━━━━━━━━━━━
HOME
  Overview
  Health & Alerts

COMMERCE
  Orders
  Products
  Categories  
  Brands
  Inventory
  Campaigns & Content

OPERATIONS
  Fulfillment
  Sourcing & Purchasing
  Suppliers
  Deliveries
  Returns & RMA

CUSTOMERS
  Customers
  Customer Support
  Notifications

GROWTH
  Content & Campaigns
  Analytics
  Search Insights

FINANCE
  Payments & Verification
  Refunds & Credits
  Supplier Payouts
  Ledger & Reports

SYSTEM
  Staff & Permissions
  Settings
  Audit Log
  System Health
```

**Mobile Drawer:**
- Hamburger menu button in header
- Drawer slides in from left
- Same navigation structure
- Close on selection

**Acceptance:**
- [ ] Desktop: Clean left sidebar navigation
- [ ] Mobile: Proper drawer navigation
- [ ] Active state shows current section
- [ ] Navigation never overlaps content
- [ ] All sections link to correct pages

---

### 1.2: Tab Elimination

**Current broken model:**
- Horizontal tab bar with 9+ tabs that doesn't scale
- Single failure breaks all tabs

**New model:**
- Navigation through sidebar/drawer instead
- Each page/section loads independently
- No global Promise.all() failures
- Better mobile experience
- Room to grow without cramped UI

**Acceptance:**
- [ ] ProductionStudioOps.tsx no longer uses tabs
- [ ] Each section is a separate page/view
- [ ] No horizontal scrolling tab bar on mobile
- [ ] Navigation is clear hierarchy, not flat list

---

### 1.3: Independent Resource Loading

**Instead of:**
```typescript
const [data, setData] = useState({...all resources...});
const load = async () => {
  const [o,or,p,s,n] = await Promise.all([...]);
  setData({...});
};
```

**Use:**
```typescript
const [overview, setOverview] = useState<ResourceState<Overview>>();
const [orders, setOrders] = useState<ResourceState<Order[]>>();
// ... each resource separate

const loadOverview = async () => {
  setOverview({ state: 'loading' });
  try {
    const data = await request('/api/admin/overview');
    setOverview({ state: 'success', data });
  } catch(e) {
    setOverview({ state: 'error', error: e.message, requestId: e.requestId });
  }
};
```

**Benefit:** 
- Overview fails? Orders page still loads
- Specific error messages per resource
- Better mobile experience
- Clearer fault boundaries

**Acceptance:**
- [ ] No Promise.all() in data loading
- [ ] Each resource is independent
- [ ] Failed resource doesn't block others
- [ ] Error messages are specific to each resource

---

## PHASE 2: ADMIN OVERVIEW (Command Center)

### Objective
Transform passive overview into operational command center with real-time status and action items.

### 2.1: System Status Section

**Top bar showing:**
- Operator name + time
- System status (healthy/warning/error)
- Database status + connection time
- API status + response time
- Payment processor status
- Email service status
- Delivery partner status

**Acceptance:**
- [ ] Real-time status indicators
- [ ] Color-coded: green(ok), yellow(warning), red(error)
- [ ] Click status to see details
- [ ] Last health check time displayed
- [ ] Not a mock - actual service health

---

### 2.2: KPI Cards (Real-time)

**Top section:**
- Revenue today (vs yesterday)
- Orders today (vs yesterday)
- Gross profit today
- Pending payments (count + amount)
- Flagged orders needing action (count)
- Low stock products (count)

**Each card:**
- Shows trend indicator (↑ vs ↓)
- Click to filter related view
- Refreshes every 60 seconds
- Shows last update time

**Acceptance:**
- [ ] All KPIs show real data, not mocks
- [ ] Trend indicators accurate
- [ ] Click navigates to filtered view
- [ ] Update time shows refresh happened

---

### 2.3: Needs Attention Section

**Organized action queue:**
1. **Payment Verification** (count + link)
   - Awaiting admin verification
   - Click: Opens payments view filtered to pending_verification

2. **Orders Awaiting Sourcing** (count + link)
   - Payment verified, but not sourced yet
   - Click: Opens orders view filtered to sourcing queue

3. **Orders Awaiting Dispatch** (count + link)
   - Sourced/purchased, not dispatched
   - Click: Opens fulfillment view

4. **Failed Deliveries** (count + link)
   - Last update failed, needs intervention
   - Click: Opens delivery view filtered to failed

5. **Low Stock Products** (count + link)
   - Below reorder level
   - Click: Opens inventory view

6. **Supplier SLA Violations** (count + link)
   - Missed delivery commitments
   - Click: Opens suppliers view with violations

7. **Refunds Awaiting Action** (count + link)
   - Pending, not processed
   - Click: Opens refunds view

Each item:
- Clickable to related resource
- Time-sensitive color (red if overdue)
- Badge count
- One-click refresh

**Acceptance:**
- [ ] Each item shows real data
- [ ] Counts accurate
- [ ] Click navigates to correct filtered view
- [ ] No items with zero data shown as empty
- [ ] Color coding based on time
- [ ] All items clickable

---

### 2.4: Trends & Analytics Section

**Charts (read-only, not real-time interactive):**
- Revenue trend (this month)
- Orders trend (this month)  
- Conversion funnel
- Payment method breakdown

**Each chart:**
- Simple, clean design
- 30-day rolling window
- Summary statistics
- Click: Link to analytics dashboard

**Acceptance:**
- [ ] Charts show real data
- [ ] 30-day window accurate
- [ ] Summary stats correct
- [ ] Charts render correctly on mobile

---

### 2.5: Recent Activity Section

**Tabbed view:**
- Recent orders (last 10 with status indicators)
- Recent notifications (last 10)
- Recent admin actions (last 10 from audit log)

Each with:
- Timestamp
- Description
- Related object link
- Status/severity indicator

**Acceptance:**
- [ ] Activity shows real data
- [ ] Timestamps accurate
- [ ] Links work
- [ ] All 3 tabs functional

---

## PHASE 3: ORDERS OPERATIONS

### Objective
Transform order table into operational workspace with real-time updates and detailed workflows.

### 3.1: Orders List/Table

**Desktop: Proper table**
- Order # (link to detail)
- Customer (link to profile)
- Items (qty)
- Payment status (with indicator)
- Fulfillment status
- Delivery status
- Total ₦
- Last updated (time)
- Quick actions (...)

**Mobile: Stacked cards**
- Order number prominently
- Customer name
- Payment status badge
- Fulfillment status badge
- Total price
- Tap card to open detail view

**Filters:**
- Status: All / Awaiting payment / Payment verification / Confirmed / Sourcing / Purchased / Out for delivery / Delivered / Cancelled
- Payment status: All / Unpaid / Pending verification / Paid / Rejected
- Delivery status: All / Pending / In transit / Delivered / Failed
- Date range
- Supplier
- Customer search
- Amount range
- Margin range

**Sort:**
- By: Order date (default), Customer, Amount, Status, Payment date, Delivery date
- Direction: Ascending, Descending

**Acceptance:**
- [ ] Desktop table shows all columns
- [ ] Mobile shows card layout
- [ ] All filters work
- [ ] Sorting works
- [ ] Search finds orders
- [ ] Pagination or infinite scroll works
- [ ] Quick actions (...) menu works

---

### 3.2: Order Detail View

**Modal/Drawer showing:**

**Header:**
- Order # + link to Vercel logs
- Customer name + email + phone (click to customer profile)
- Order date
- Last updated
- Current status + timeline

**Timeline View:**
- Payment submitted (time)
- Payment verified (time)  
- Sourcing started (time)
- Sourcing completed / Purchased (time)
- Dispatched (time)
- Delivered (time)

**Sections:**

**Items**
- Product name + SKU
- Quantity
- Unit price
- Total

**Payment**
- Payment reference
- Payment method
- Amount
- Status (unpaid/pending/paid/rejected)
- Submitted: time
- Verified: time
- Verification action button (if pending)

**Supplier**
- Supplier name (link)
- Contact
- Lead time
- Expected delivery date
- Actual delivery date

**Costs**
- Unit price: ₦
- Purchase cost: ₦
- Delivery fee: ₦
- Other costs: ₦
- Total cost: ₦
- **Margin: ₦ (X%)**

**Sourcing**
- Status
- Supplier assigned
- Order placed: date/time
- Tracking number
- SLA deadline
- Status indicators

**Fulfillment**
- Courier: name + reference
- Status (pending/preparing/dispatched/in_transit/delivered/failed)
- Tracking number (click to courier)
- Expected delivery: date
- Actual delivery: date
- Delivery address

**Customer Notifications**
- List of notifications sent to customer
- With timestamps and status

**Audit History**
- All changes to this order
- Who, what, when
- Payment updates
- Status transitions
- Cost adjustments

**Actions Menu:**
- [ ] Update payment status
- [ ] Assign supplier
- [ ] Update sourcing status
- [ ] Mark as dispatched
- [ ] Update delivery status
- [ ] Create refund
- [ ] Add note
- [ ] Send notification to customer

Each action:
- Opens confirmation dialog
- Shows exactly what will change
- Server-side authorized
- Audit logged

**Acceptance:**
- [ ] Detail view opens from order list
- [ ] All sections show real data
- [ ] Timeline accurate
- [ ] Margin calculation correct
- [ ] All links work
- [ ] Actions are server-authorized
- [ ] Changes audit logged
- [ ] Close without changes cancels
- [ ] Mobile: drawer scrollable, not cramped

---

## PHASE 4: PAYMENTS (Verification Queue)

### Objective
Make payment verification explicit and actionable.

### 4.1: Payment Verification Queue

**Status cards at top:**
- Pending verification (count)
- Paid (count)
- Rejected (count)

**Verification queue table:**
- Order # (link)
- Customer
- Amount ₦
- Payment reference
- Submitted: date/time
- Reference details (bank name, account, confirmation screenshot if available)
- Actions: [Verify] [Reject]

**Bulk actions:**
- [ ] Select multiple
- [ ] Verify all selected
- [ ] Reject all selected

**Each verification:**
- Opens confirmation
- Shows exactly what will be marked as paid
- Links to order detail
- Allows adding note
- Audit logged

**Acceptance:**
- [ ] Queue shows pending payments
- [ ] Sort by oldest first (FIFO)
- [ ] [Verify] button actually verifies
- [ ] [Reject] button actually rejects
- [ ] Both actions audit logged
- [ ] Customer notified of verification/rejection

---

### 4.2: Payment Ledger

**View of all payments with:**
- Status breakdown cards (paid/pending/rejected with totals)
- Payment method breakdown
- Payment date picker (to filter date range)
- Verification rate % (verified vs total attempts)

**Ledger table:**
- Order #
- Customer
- Amount
- Method
- Reference
- Submitted: date
- Verified: date (or pending)
- Status

**Acceptance:**
- [ ] Ledger accurate
- [ ] Filters work
- [ ] Status accurate for each payment

---

## PHASE 5+: (Remaining Phases)

Due to scope limitations, I'm documenting architecture for:

- **Phase 5: Products** - Proper product management with variants, attributes, categories
- **Phase 6: Suppliers** - Supplier profiles with performance metrics
- **Phase 7: Inventory** - Stock tracking with movements
- **Phase 8: Sourcing** - Queue-based sourcing workflow
- **Phase 9: Fulfillment** - Delivery and tracking management
- **Phase 10: Customers** - Customer profiles and segmentation
- **Phase 11: Notifications** - Actionable notification inbox
- **Phase 12: Analytics** - Business intelligence dashboards
- **Phase 13: Finance** - Revenue, costs, profit reporting
- **Phase 14: Settings & Admin** - Staff, permissions, system configuration

---

## Database Schema Changes Required

### New Tables
- (All existing RBAC tables are already defined in migrations, just need to be applied)

### Updated Migrations
- Migration 027: Standardize permission codes (if needed)
- Migration 028: Add health check tracking tables (optional)
- Migration 029: Add analytics event aggregation (optional)

### No Data Loss Required
- All changes are additive
- Existing data preserved
- Safe to apply

---

## Testing Strategy

### Phase 0 Recovery Verification
1. Health endpoint returns healthy
2. Each admin endpoint individually callable
3. No 500 errors
4. Permissions checked correctly
5. Request IDs logged server-side

### Phase 1 Architecture Verification
1. Navigation renders correctly (desktop + mobile)
2. Each section loads independently
3. One broken resource doesn't break others
4. Error states display correctly
5. Mobile responsive
6. No horizontal scrolling

### Phase 2+ Feature Verification
See spec files for each phase

---

## Deployment Strategy

### Pre-Deployment
1. Database schema verified
2. Permission codes consistent
3. All tests passing
4. Staging environment mirrors production
5. Backup created
6. Rollback plan documented

### Deployment
1. Stop serving admin requests (optional maintenance page)
2. Run database recovery (if needed)
3. Deploy new code
4. Run health check
5. Monitor error rates (first hour)
6. Verify each admin endpoint works

### Post-Deployment
1. Monitor admin dashboard usage
2. Check error logs for new issues
3. Verify permissions enforcement
4. Audit successful logins
5. Gradual rollout if multiple admin instances

---

## Success Criteria

### Phase 0: Production Stability
- ✅ No 500 errors
- ✅ All admin endpoints return success for authorized users
- ✅ Permissions enforced correctly
- ✅ Error diagnostics available

### Phase 1: Improved Architecture
- ✅ Each resource loads independently
- ✅ Navigation scales to 20+ sections
- ✅ Mobile friendly
- ✅ No global failures
- ✅ Clear error messages

### Phase 2+: Operations Platform
- ✅ Operators work efficiently
- ✅ Action items clear and actionable
- ✅ Real-time status accurate
- ✅ Workflows explicit and audited
- ✅ Mobile and desktop both functional
- ✅ System scales to growing orders/data

