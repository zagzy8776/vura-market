# Tasks: Vura Studio Admin System - Phase 0 Emergency Recovery

# Implementation Plan

This document contains 7 sequential recovery tasks for Phase 0 emergency recovery of the Vura Studio Admin system. Tasks are organized by priority and dependency, with some able to run in parallel after Task 1 completes.

## Overview

Phase 0 emergency recovery tasks focus on restoring production database schema and implementing error diagnostics. All tasks are blocking on each other in sequence until Task 3 completes, after which Task 4 and Task 5 can execute in parallel.

---

## Tasks

- [x] 1. Verify & Recover RBAC Schema (Phase 0.1a)
- [x] 2. Verify & Seed RBAC Data (Phase 0.1b)
- [x] 3. Audit & Resolve Permission Code Mismatches (Phase 0.2)
- [x] 4. Implement Health Endpoint (Phase 0.3a)
- [x] 5. Refactor ProductionStudioOps to Independent Loading (Phase 0.3b)
- [x] 6. Verify Phase 0 Complete & Production Healthy (Phase 0 Verification)
- [x] 7. Document Phase 0 Recovery (Phase 0 Documentation)

---

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": [1],
      "description": "Database Recovery"
    },
    {
      "wave": 2,
      "tasks": [2],
      "description": "Data Verification & Seeding"
    },
    {
      "wave": 3,
      "tasks": [3, 4, 5],
      "description": "Parallel: Code Audit, Health Endpoint, Frontend Refactor"
    },
    {
      "wave": 4,
      "tasks": [6],
      "description": "Integration Verification"
    },
    {
      "wave": 5,
      "tasks": [7],
      "description": "Documentation"
    }
  ]
}
```

---

## Task Details

### 1. Verify & Recover RBAC Schema (Phase 0.1a)

**Type:** Database recovery / verification  
**Priority:** CRITICAL  
**Depends:** None  

**Description:**
Verify whether RBAC tables and functions exist in production database. If missing, execute recovery steps: delete false migration records and re-run migrations.

**Sub-Tasks:**
- [ ] Query production database: Check if admin_roles table exists
- [ ] Query production database: Check if has_admin_permission() function exists  
- [ ] Query production database: Review schema_migrations table for versions 001, 007, 019, 020
- [ ] Decision: If tables/function exist, mark task complete and proceed to Task 2
- [ ] Decision: If missing, proceed with recovery
- [ ] Execute: DELETE FROM schema_migrations WHERE version IN ('001', '007', '019', '020', '021', '024', '025', '026')
- [ ] Execute: npm run db:migrate (re-run migrations)
- [ ] Verify: admin_roles table exists
- [ ] Verify: admin_permissions table exists  
- [ ] Verify: admin_user_roles table exists
- [ ] Verify: admin_role_permissions table exists
- [ ] Verify: has_admin_permission() function exists

**Acceptance Criteria:**
- [ ] All 4 RBAC tables exist in database
- [ ] has_admin_permission() function is callable
- [ ] schema_migrations reflects current state accurately
- [ ] No SQL errors in logs
- [ ] Process documented for future reference

**Files Modified/Created:**
- None (query/migration only)

---

### 2. Verify & Seed RBAC Data (Phase 0.1b)

**Type:** Database verification / seeding  
**Priority:** CRITICAL  
**Depends:** Task 1  

**Description:**
Verify that RBAC tables are properly seeded with roles and permissions. Seed missing data if necessary.

**Sub-Tasks:**
- [ ] Query: SELECT COUNT(*) FROM admin_roles (expected: 6+ roles including owner)
- [ ] Query: SELECT COUNT(*) FROM admin_permissions (expected: 18+ permissions)
- [ ] Query: SELECT COUNT(*) FROM admin_user_roles (expected: 1+ assignments)
- [ ] List all roles: SELECT name FROM admin_roles (should include owner)
- [ ] List all permissions: SELECT code FROM admin_permissions (verify complete list)
- [ ] If roles missing: Execute migration 007 role seeding (if not already done)
- [ ] If permissions missing: Execute migration 020 permission seeding (if not already done)
- [ ] If admin_user_roles missing: Assign admin users to owner role
- [ ] Test: SELECT has_admin_permission(<admin_uuid>, 'dashboard.read') → should return true

**Acceptance Criteria:**
- [ ] admin_roles table contains: owner, manager, viewer, finance (minimum)
- [ ] admin_permissions table contains: dashboard.read, products.read, products.create, products.write, orders.read, orders.write, suppliers.read, suppliers.create, suppliers.write, categories.read, customers.read, notifications.read, deliveries.read, finance.read, refunds.create
- [ ] At least 1 admin user assigned to owner role
- [ ] has_admin_permission() function works correctly
- [ ] Test query returns true for valid permission

**Files Modified/Created:**
- None (query/seeding only)

---

### 3. Audit & Resolve Permission Code Mismatches (Phase 0.2)

**Type:** Code audit + potential migration  
**Priority:** CRITICAL  
**Depends:** Task 2  

**Description:**
Audit permission codes in api/admin.ts and compare against database. Create migration if inconsistencies found.

**Sub-Tasks:**
- [ ] Read api/admin.ts: List all requireAdminPermission() calls and their permission strings
- [ ] Documented permission codes needed: dashboard.read, products.read, products.create, products.write, orders.read, orders.write, suppliers.read, suppliers.create, suppliers.write, categories.read, customers.read, notifications.read, deliveries.read, finance.read, refunds.create, deliveries.manage
- [ ] Query database: SELECT code FROM admin_permissions ORDER BY code
- [ ] Compare: Identify any mismatch (e.g., products.update vs products.write)
- [ ] Document findings: Which codes exist, which are missing, which need renaming
- [ ] Decision: If matches perfectly, mark complete and proceed to Task 4
- [ ] Decision: If mismatches exist, create migration 028
- [ ] Create migration file: db/migrations/028_standardize_permission_codes.sql
- [ ] Migration logic: Update/insert permission codes to match api/admin.ts exactly
- [ ] Migration test: Execute migration in dev database, verify codes match
- [ ] Execute migration: npm run db:migrate
- [ ] Verify: Query database again, confirm all codes match api/admin.ts

**Acceptance Criteria:**
- [ ] All permission codes in api/admin.ts exist in admin_permissions
- [ ] No permission code variations (.update vs .write inconsistencies)
- [ ] Owner role assigned all necessary permissions
- [ ] Migration 028 is idempotent (can re-run safely)
- [ ] Test: SELECT has_admin_permission(<owner_uuid>, 'products.write') returns true

**Files Modified/Created:**
- db/migrations/028_standardize_permission_codes.sql (if inconsistencies found)

---

### 4. Implement Health Endpoint (Phase 0.3a)

**Type:** Backend implementation  
**Priority:** HIGH  
**Depends:** Task 2  

**Description:**
Create GET /api/admin/health endpoint that returns system diagnostics without requiring authentication.

**Sub-Tasks:**
- [ ] Create file: api/admin/health.ts
- [ ] Implement: GET handler
- [ ] Query: Test database connection, measure response time
- [ ] Query: Verify admin_roles table exists
- [ ] Query: Verify admin_permissions table exists
- [ ] Query: Verify admin_user_roles table exists
- [ ] Query: Verify admin_role_permissions table exists
- [ ] Query: Verify has_admin_permission() function exists
- [ ] Query: Check schema_migrations table status
- [ ] Generate: Request ID (UUID) for every request
- [ ] Return: JSON with status (healthy/degraded/down) and all component details
- [ ] Add X-Request-ID header to response
- [ ] No authentication required (for diagnostics)
- [ ] Test locally: GET http://localhost:3000/api/admin/health
- [ ] Verify response includes all required fields

**Acceptance Criteria:**
- [ ] GET /api/admin/health returns HTTP 200
- [ ] Response includes status field (healthy/degraded/down)
- [ ] Response includes database.connected boolean
- [ ] Response includes rbac.initialized boolean
- [ ] Response includes tables array (all 4 RBAC tables listed)
- [ ] Response includes function existence check
- [ ] Response includes migrations.count and migrations.status
- [ ] X-Request-ID header present and unique
- [ ] Response includes requestId in JSON body
- [ ] Response includes timestamp (ISO format)
- [ ] Test: Status is "healthy" if all checks pass

**Files Modified/Created:**
- api/admin/health.ts (new)

---

### 5. Refactor ProductionStudioOps to Independent Loading (Phase 0.3b)

**Type:** Frontend refactoring  
**Priority:** HIGH  
**Depends:** Task 1  

**Description:**
Replace Promise.all() with independent resource loading so one failing resource doesn't break entire dashboard.

**Sub-Tasks:**
- [ ] Read: src/pages/studio/ProductionStudioOps.tsx (current implementation)
- [ ] Identify: All resources loaded via Promise.all() (overview, orders, products, suppliers, notifications, etc.)
- [ ] Create: ResourceState type definition (state, data, error, lastUpdate)
- [ ] Refactor: Replace global data state with per-resource state
- [ ] Implement: Separate loader function for each resource
- [ ] Each loader: Sets loading state, tries request, catches error without affecting others
- [ ] Remove: Promise.all() pattern entirely
- [ ] Update: Tab/section rendering to check per-resource state
- [ ] Add: Error display per tab (not global error)
- [ ] Add: Retry button on each error state
- [ ] Add: Request ID display in error messages
- [ ] Add: Specific error message (not generic "could not complete")
- [ ] Test: Load page, verify each section loads independently
- [ ] Test: Disable one endpoint (simulate failure), verify others still load
- [ ] Test: Click retry on error, verify retry works
- [ ] Test: Mobile view, verify responsive and no overflow

**Acceptance Criteria:**
- [ ] ProductionStudioOps.tsx doesn't use Promise.all()
- [ ] Each resource has independent state management
- [ ] If overview fails to load, orders/products/etc can still load
- [ ] Error state shows specific error message and request ID
- [ ] Retry button exists and works
- [ ] No 500 error causes entire dashboard to fail
- [ ] Mobile layout responsive (no horizontal overflow)
- [ ] All sections load correctly on first load (happy path)

**Files Modified/Created:**
- src/pages/studio/ProductionStudioOps.tsx (refactor)
- src/types/admin.ts or src/pages/studio/types.ts (add ResourceState type)

---

### 6. Verify Phase 0 Complete & Production Healthy (Phase 0 Verification)

**Type:** Integration verification  
**Priority:** CRITICAL  
**Depends:** Task 4, Task 5  

**Description:**
Run comprehensive verification that Phase 0 recovery is complete and production is healthy.

**Sub-Tasks:**
- [ ] Query: Call /api/admin/health endpoint
- [ ] Verify: Response status is "healthy"
- [ ] Verify: Database.connected is true
- [ ] Verify: rbac.initialized is true
- [ ] Verify: All 4 RBAC tables listed in response
- [ ] Verify: Function exists is true
- [ ] Query: Call /api/admin?resource=overview (as authenticated admin user)
- [ ] Verify: Returns 200 (not 500)
- [ ] Verify: Response contains expected fields (liveProducts, monthlyOrders, revenue, profit, etc.)
- [ ] Query: Call /api/admin?resource=products (as authenticated admin user)
- [ ] Verify: Returns 200 with product list
- [ ] Query: Call /api/admin?resource=orders (as authenticated admin user)
- [ ] Verify: Returns 200 with order list
- [ ] Query: Call /api/admin?resource=suppliers (as authenticated admin user)
- [ ] Verify: Returns 200 with supplier list
- [ ] Load: AdminApp in browser (staged or production)
- [ ] Verify: Dashboard loads without errors
- [ ] Verify: Each section (overview, orders, products, etc.) can load independently
- [ ] Verify: One section error doesn't break others
- [ ] Test: Admin user can log in
- [ ] Test: Admin user can view overview
- [ ] Test: Admin user can view all sections
- [ ] Check: Logs for any 500 errors or exceptions
- [ ] Document: Health status and any remaining issues

**Acceptance Criteria:**
- [ ] /api/admin/health returns status "healthy"
- [ ] All admin endpoints return 200 (not 500) for authorized users
- [ ] No 500 errors in application logs
- [ ] Dashboard loads successfully
- [ ] Each section loads independently
- [ ] One failing section doesn't break others
- [ ] Admin user can perform operations
- [ ] Error messages are specific (not generic)
- [ ] Request IDs visible for debugging
- [ ] Mobile responsive on all sections

**Files Modified/Created:**
- None (verification only)

---

### 7. Document Phase 0 Recovery (Phase 0 Documentation)

**Type:** Documentation  
**Priority:** MEDIUM  
**Depends:** Task 6  

**Description:**
Document the Phase 0 recovery process and results for team reference.

**Sub-Tasks:**
- [ ] Create: PHASE_0_RECOVERY_SUMMARY.md in project root
- [ ] Document: Date/time of recovery
- [ ] Document: What was broken (RBAC tables missing, function missing)
- [ ] Document: What was fixed (recovery steps taken)
- [ ] Document: Commands executed (for future reference)
- [ ] Document: Verification results (all checks passed)
- [ ] Document: Timeline (how long recovery took)
- [ ] Document: Any manual interventions needed
- [ ] Document: Lessons learned
- [ ] Update: PRODUCTION_DIAGNOSIS_REPORT.md with resolution
- [ ] Commit: All changes to git (recovery scripts, migrations, code changes)
- [ ] Tag: git tag as v0-recovery-complete

**Acceptance Criteria:**
- [ ] Phase 0 recovery summary document exists
- [ ] All recovery steps documented
- [ ] Verification results documented
- [ ] Changes committed to git with clear message
- [ ] Team can reproduce recovery process if needed

**Files Modified/Created:**
- PHASE_0_RECOVERY_SUMMARY.md (new)
- Update: PRODUCTION_DIAGNOSIS_REPORT.md (mark resolved)

---

## Summary

**Critical Path (must complete in sequence):**
1. Task 1: Verify/Recover RBAC Schema → ~2 hours
2. Task 2: Verify/Seed RBAC Data → ~1 hour
3. Task 3: Audit Permission Codes → ~1 hour
4. Task 4: Implement Health Endpoint → ~1 hour
5. Task 5: Refactor ProductionStudioOps → ~2 hours (can start after Task 1)
6. Task 6: Verification → ~1 hour
7. Task 7: Documentation → ~1 hour

**Parallelizable:**
- Task 4 and Task 5 can run after Task 1 completes (don't depend on 2/3)

**Total Estimated Time:** 6-8 hours (critical path + parallelization)

**Next Phase (Phase 1) Blocked Until:**
- Task 6 verification passes (production healthy)
- Task 7 documentation complete

---

## PHASE 1: NAVIGATION ARCHITECTURE

- [ ] 8. Create AdminSidebar Component (Desktop navigation)
- [ ] 9. Create AdminMobileDrawer Component (Mobile navigation)
- [ ] 10. Refactor AdminApp to use sidebar/drawer layout
- [ ] 11. Update ProductionStudioOps to remove tab navigation
- [ ] 12. Test navigation on mobile and desktop

---

## PHASE 2: ADMIN OVERVIEW (Command Center)

- [ ] 13. Create AdminOverview component with system status
- [ ] 14. Implement KPI cards (real-time metrics)
- [ ] 15. Implement needs attention action queue
- [ ] 16. Add trends and analytics section
- [ ] 17. Add recent activity section

---

## PHASE 3+: REMAINING FEATURES

- [ ] 18. Orders Operations (detailed order management)
- [ ] 19. Payments & Verification Queue
- [ ] 20. Products Management
- [ ] 21. Suppliers & Sourcing
- [ ] 22. Customers & Profiles
- [ ] 23. Inventory Management
- [ ] 24. Fulfillment & Delivery
- [ ] 25. Refunds & RMA
- [ ] 26. Analytics Dashboard
- [ ] 27. Finance & Reporting
- [ ] 28. Settings & Admin Panel
- [ ] 29. Audit Log Advanced
- [ ] 30. System Health & Monitoring

---

## Notes

- **Risk Level:** Phase 0 CRITICAL (database), Phase 1+ MEDIUM (UI refactoring)
- **Rollback Strategy:** All changes are additive; frontend can be rolled back independently
- **Monitoring:** Health endpoint provides ongoing diagnostics
- **Communication:** Update team after each phase completion
- **Escalation:** If health endpoint shows "degraded" or "down", escalate immediately
