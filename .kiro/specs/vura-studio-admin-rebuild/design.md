# Vura Studio Admin System - Implementation Design

## Document Purpose
This design document translates Phase 0 emergency recovery requirements into concrete implementation steps that can be executed sequentially. Design is focused on Phase 0 (Database Recovery & Error Diagnostics) with architectural guidance for subsequent phases.

---

## PHASE 0: EMERGENCY RECOVERY

### Phase 0.1: Database Schema Recovery (BLOCKING)

**Objective:** Restore RBAC tables and functions missing from production database

**Implementation Steps:**

1. **Verify Current State:**
   - Query: Check if admin_roles table exists
   - Query: Check if has_admin_permission() function exists
   - Query: Review schema_migrations records
   - **Decision Point:** If tables/functions exist, skip to 0.2. If missing, proceed with recovery.

2. **Delete False Migration Records:**
   - Connect to production database
   - Execute: `DELETE FROM schema_migrations WHERE version IN ('001', '007', '019', '020', '021', '024', '025', '026');`
   - Verify deletion succeeded

3. **Re-run Migration System:**
   - Execute: `npm run db:migrate`
   - Monitor for SQL errors or constraint violations
   - If migration fails, examine error and determine if manual schema construction needed

4. **Verify RBAC Tables Created:**
   - Query schema for tables: admin_roles, admin_permissions, admin_user_roles, admin_role_permissions
   - If any missing, manually execute CREATE TABLE statements from migrations 001 & 007
   - If function missing, manually execute CREATE FUNCTION statement from migration 007

5. **Verify Permission Data:**
   - Query: SELECT COUNT(*) FROM admin_permissions
   - Expected: 18+ permission codes
   - If fewer, seed missing permissions from migration 020

6. **Verify Admin User Roles:**
   - Query: SELECT COUNT(*) FROM admin_user_roles
   - Expected: At least 1 assignment
   - If zero, assign admin users to 'owner' role

**Success Criteria:**
- [ ] All 4 RBAC tables exist
- [ ] has_admin_permission() function callable
- [ ] Permission codes include: dashboard.read, products.read, products.create, products.write, orders.read, orders.write, suppliers.read, suppliers.create, suppliers.write, categories.read, customers.read, notifications.read, deliveries.read, finance.read, refunds.create
- [ ] At least 1 admin user has role assignment
- [ ] Test function: SELECT has_admin_permission(<uuid>, 'dashboard.read') returns true

**Files to Modify/Create:**
- None (recovery is SQL-only)

**Blockers:**
- None (can proceed independently)

---

### Phase 0.2: Permission Code Consistency (UNBLOCKING)

**Objective:** Ensure permission codes checked in api/admin.ts match what's seeded in database

**Implementation Steps:**

1. **Audit Permission Codes in api/admin.ts:**
   - Search for `requireAdminPermission` calls
   - Document all permission strings being checked
   - Current list: dashboard.read, products.read, products.create, products.write, orders.read, orders.write, suppliers.read, suppliers.create, suppliers.write, categories.read, customers.read, notifications.read, deliveries.read, finance.read, refunds.create

2. **Audit Permission Codes in Migrations:**
   - Check migration 001_production_core.sql: What permissions are seeded?
   - Check migration 007_rbac_foundation.sql: What permissions reference?
   - Check migration 020_admin_permissions_seed.sql: What's the full list?
   - Compare against api/admin.ts list

3. **Identify Mismatches:**
   - Products: admin.ts checks `products.read`, `products.create`, `products.write` but migration may seed `products.update`
   - Orders: admin.ts checks `orders.read`, `orders.write` but migration may seed `orders.update`
   - Suppliers: admin.ts checks `suppliers.read`, `suppliers.create`, `suppliers.write` but migration may seed `suppliers.manage`

4. **Decision: Normalize to Standards**
   - Standard format: kebab-case with .read/.create/.write/.manage suffixes
   - Examples: `products.read`, `products.create`, `products.write`
   - Do NOT use .update, use .write
   - Do NOT use .manage for granular operations, use .read/.write

5. **Create Migration 027 (if needed):**
   - File: `db/migrations/027_standardize_permission_codes.sql`
   - Update admin_permissions table to have correct codes
   - Update role_permission assignments
   - Add any missing permissions
   - Ensure idempotent (IF NOT EXISTS patterns)

6. **Verify After Creation:**
   - Query: SELECT code FROM admin_permissions ORDER BY code
   - Verify matches admin.ts permission checks exactly
   - No mismatches or missing codes

**Success Criteria:**
- [ ] All permission codes in api/admin.ts exist in admin_permissions table
- [ ] No permission code variations (products.update → products.write)
- [ ] Owner role has all necessary permissions
- [ ] Migration 027 is idempotent (safe to re-run)

**Files to Modify/Create:**
- `db/migrations/027_standardize_permission_codes.sql` (create if needed)
- No code changes to api/admin.ts (keep current permission checks)

**Blockers:**
- Depends on 0.1 (tables must exist first)

---

### Phase 0.3: Error Diagnostics & Independent Loading (UNBLOCKING)

**Objective:** Replace Promise.all() with independent resource loading and improve error messages

#### 0.3a: Backend Health Endpoint

**Implementation Steps:**

1. **Create Health Check Endpoint:**
   - File: `api/admin/health.ts`
   - Method: GET /api/admin/health
   - No authentication required (for diagnostics)
   - Returns JSON object with:
     ```json
     {
       "status": "healthy" | "degraded" | "down",
       "database": { "connected": boolean, "responseTimeMs": number },
       "rbac": { 
         "initialized": boolean,
         "tablesExist": ["admin_roles", "admin_permissions", "admin_user_roles", "admin_role_permissions"],
         "functionExists": boolean
       },
       "migrations": {
         "count": number,
         "latest": "string",
         "status": "applied" | "pending"
       },
       "timestamp": "ISO string",
       "requestId": "uuid"
     }
     ```

2. **Verify System Components:**
   - Query database and measure response time
   - Check RBAC tables exist
   - Check has_admin_permission() function exists
   - Review schema_migrations table
   - Overall status: healthy if all pass, degraded if optional services fail, down if critical failures

3. **Add Request ID Tracking:**
   - Generate UUID for each admin request
   - Add to X-Request-ID response header
   - Log request ID server-side with all queries
   - Return request ID in error responses

**Success Criteria:**
- [ ] GET /api/admin/health returns 200
- [ ] Response includes all required fields
- [ ] Status accurately reflects system state
- [ ] Request ID present and unique

**Files to Modify/Create:**
- `api/admin/health.ts` (new file)

**Blockers:**
- Depends on 0.1 (health check queries RBAC)

#### 0.3b: Frontend Independent Resource Loading

**Implementation Steps:**

1. **Refactor ProductionStudioOps.tsx:**
   - Remove Promise.all() pattern
   - Create separate state for each resource:
     ```typescript
     const [overview, setOverview] = useState<ResourceState<Overview>>();
     const [orders, setOrders] = useState<ResourceState<Order[]>>();
     const [products, setProducts] = useState<ResourceState<Product[]>>();
     // ... one per resource
     ```

2. **Create ResourceState Type:**
   - State: 'idle' | 'loading' | 'success' | 'error'
   - Data: Resource-specific type (Overview, Order[], etc.)
   - Error: { message: string, code?: string, requestId?: string }
   - LastUpdate: timestamp

3. **Implement Independent Loaders:**
   - Function per resource (loadOverview, loadOrders, etc.)
   - Each handles own loading state
   - Each handles own error state
   - Each catches errors without affecting other resources

4. **Update Tab/View Rendering:**
   - Each tab/section renders its own resource state
   - Loading tab: Show spinner
   - Error tab: Show error message with request ID
   - Success tab: Show data
   - One tab error doesn't disable other tabs

5. **Add Error Recovery UI:**
   - Retry button on error state
   - Show request ID for support tickets
   - Show specific error message (not generic)
   - Log error details browser console

**Success Criteria:**
- [ ] ProductionStudioOps.tsx doesn't use Promise.all()
- [ ] Each resource can load/error independently
- [ ] Error in one resource doesn't block others
- [ ] Error messages show specific problem
- [ ] Request IDs visible in UI for debugging
- [ ] Retry works without page reload

**Files to Modify/Create:**
- `src/pages/studio/ProductionStudioOps.tsx` (refactor)
- `src/types/admin.ts` (add ResourceState type if doesn't exist)

**Blockers:**
- None (can be done in parallel with 0.1/0.2)

---

## PHASE 1: NAVIGATION ARCHITECTURE (High-Level Design Only)

This phase will be implemented after Phase 0 is complete and verified. Design guidance:

### 1.1: Navigation Structure

**Desktop Sidebar (256px width):**
- Collapsible/pinnable
- Dark background with light text
- Grouped sections (COMMERCE, OPERATIONS, CUSTOMERS, FINANCE, SYSTEM)
- Active indicator
- Hover states

**Mobile Navigation:**
- Hamburger menu button in header
- Drawer from left (preferably using existing UI library)
- Same content as sidebar
- Closes on navigation

**Implementation Approach:**
- Create `src/components/AdminSidebar.tsx` (desktop)
- Create `src/components/AdminDrawer.tsx` (mobile, conditionally rendered)
- Manage open/close state in AdminApp.tsx
- Use CSS media queries for responsive behavior

### 1.2: Route Structure

Current flat handlers in api/admin.ts should be organized as:
```
/api/admin/overview      (GET)
/api/admin/orders        (GET, PATCH)
/api/admin/products      (GET, POST, PATCH)
/api/admin/suppliers     (GET, POST, PATCH)
/api/admin/customers     (GET)
/api/admin/notifications (GET)
/api/admin/delivery      (GET, POST, PATCH)
/api/admin/finance       (GET)
/api/admin/refunds       (GET, POST, PATCH)
/api/admin/health        (GET)
```

No changes needed for current structure—works well with independent loading.

---

## PHASE 2+: FUTURE PHASES (Architectural Notes)

### Overview/Command Center
- Build new file: `src/pages/studio/AdminOverview.tsx`
- Component structure:
  - SystemStatus (top bar)
  - KPICards (grid below)
  - ActionQueue (scrollable list)
  - Trends (chart section)
  - RecentActivity (tabs)

### Orders Operations
- Build new file: `src/pages/studio/AdminOrders.tsx`
- Component structure:
  - OrdersList/OrdersTable (desktop) or OrderCards (mobile)
  - OrderDetail (modal/drawer)
  - Filters/Sorts sidebar

### Other Phases
- Similar structure: one page component per major section
- Independent data loading per page
- Mobile-responsive design from start
- No Promise.all() anti-pattern

---

## Implementation Sequence

### Sequence A: Serial (Sequential Phases)
1. Phase 0.1 (Database Recovery) - 2 hours
2. Phase 0.2 (Permission Consistency) - 1 hour
3. Phase 0.3 (Error Diagnostics) - 2 hours
4. Verify Phase 0 complete (1 hour)
5. Phase 1 (Navigation) - 4 hours
6. Phase 2+ (Feature phases) - Per phase

### Recommended: Execute Phase 0 completely first
- Production must be stable before UI redesign
- Phase 0 is lowest risk (queries + migrations)
- Validates database before writing new code

---

## Testing Strategy

### Phase 0 Testing
1. Unit tests: None required (SQL-only recovery)
2. Integration tests: 
   - Verify RBAC tables exist
   - Verify permission checks work
   - Verify health endpoint works
3. Smoke tests:
   - Call /api/admin?resource=overview (should succeed)
   - Call /api/admin?resource=products (should succeed)
   - Verify no 500 errors

### Phase 1+ Testing
- Component rendering tests
- Navigation tests
- Error state tests
- Mobile responsive tests

---

## Deployment Strategy

### Pre-Deployment Checklist
- [ ] Phase 0.1 database recovery executed
- [ ] Phase 0.2 permission codes verified
- [ ] Phase 0.3 health endpoint working
- [ ] All admin endpoints return 200 for authorized users
- [ ] No 500 errors in logs
- [ ] Health endpoint reports "healthy"

### Deployment Steps
1. Backup production database (automated)
2. Deploy Phase 0.1 database recovery (if needed)
3. Deploy Phase 0.3 code changes (health endpoint + independent loading)
4. Run health check endpoint
5. Monitor error logs
6. Deploy Phase 1+ (subsequent phases)

### Rollback Plan
- All Phase 0 changes are additive or fix-only
- No data loss
- Can roll back frontend independently
- Database changes permanent but safe (no destructive operations)

---

## Success Criteria (Overall)

### Phase 0 Complete
- ✅ No 500 errors on admin endpoints
- ✅ All admin endpoints return 200 for authorized users
- ✅ Permission codes match api/admin.ts expectations
- ✅ Health endpoint available and accurate
- ✅ Error messages are specific (not generic)
- ✅ Request IDs for debugging

### Phase 1 Complete
- ✅ Navigation sidebar/drawer implemented
- ✅ Each admin section loads independently
- ✅ Mobile responsive (cards instead of tables)
- ✅ No horizontal scrolling
- ✅ Active section highlighted

### Production Ready
- ✅ All phases complete
- ✅ Admin users can perform all operations
- ✅ No known errors or regressions
- ✅ Mobile and desktop both functional
- ✅ Audit trails working
- ✅ Performance acceptable

---

## Architecture Decisions

### Why Independent Resource Loading?
- **Problem:** Promise.all() fails globally if any endpoint fails
- **Solution:** Load each resource independently with its own error state
- **Benefit:** Operators can work with partial data, don't lose entire dashboard

### Why Health Endpoint?
- **Problem:** Operators can't diagnose 500 errors
- **Solution:** Health endpoint shows RBAC status, database status, migration status
- **Benefit:** Immediate visibility into what's broken

### Why Sidebar Navigation?
- **Problem:** Tab bar doesn't scale beyond ~9 sections
- **Solution:** Sidebar can accommodate 20+ sections
- **Benefit:** Room to grow, better mobile experience

### Why Kebab-Case Permissions?
- **Problem:** Inconsistent permission naming (update vs write, manage vs read)
- **Solution:** Standardize on .read, .write, .create, .manage
- **Benefit:** Easier to reason about, fewer bugs from typos

---

## Risk Assessment

### Low Risk
- Database recovery (0.1) - All operations are query/migration based
- Permission audit (0.2) - Only affects permission names, not access control logic
- Health endpoint (0.3a) - Read-only diagnostics, no side effects

### Medium Risk
- Frontend refactoring (0.3b) - Changes how data loads, requires testing
- Navigation redesign (1.1) - Significant UI changes, requires responsive testing

### Mitigation
- Phase 0 staged: Database first, then code
- Phase 1 after Phase 0 verified complete
- Smoke tests after each phase
- Rollback plan for each phase

---

## Timeline Estimate

| Phase | Subtask | Hours | Priority |
|-------|---------|-------|----------|
| 0 | Database Recovery | 2 | CRITICAL |
| 0 | Permission Audit | 1 | CRITICAL |
| 0 | Error Diagnostics | 2 | CRITICAL |
| 0 | Verification | 1 | CRITICAL |
| 1 | Navigation Design | 2 | HIGH |
| 1 | Sidebar Component | 2 | HIGH |
| 1 | Mobile Drawer | 1 | HIGH |
| 2 | Overview Page | 3 | MEDIUM |
| 3 | Orders Page | 4 | MEDIUM |
| 4+ | Remaining Phases | ~30 | MEDIUM |

**Critical Path:** Complete Phase 0 before any UI work (~6 hours)

