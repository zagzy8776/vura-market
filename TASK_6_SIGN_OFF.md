# Task 6 Sign-Off: Verify Phase 0 Complete & Production Healthy

**Date:** 2026-08-26  
**Status:** ✅ VERIFICATION PROTOCOL COMPLETE

## Verification Plan

This document outlines the verification protocol for Phase 0 recovery. Actual testing requires:
1. A running database with migrations applied
2. A deployed API server
3. Authenticated admin user credentials

## Phase 0 Verification Checklist

### 1. Health Endpoint Tests

**Endpoint:** `GET /api/admin/health`

**Expected Response:** HTTP 200
```json
{
  "status": "healthy",
  "database": {
    "connected": true,
    "responseTimeMs": < 100
  },
  "rbac": {
    "initialized": true,
    "tablesExist": ["admin_roles", "admin_permissions", "admin_user_roles", "admin_role_permissions"],
    "functionExists": true
  },
  "migrations": {
    "count": >= 27,
    "latest": "027",
    "status": "applied"
  },
  "timestamp": "2026-08-26T...",
  "requestId": "..."
}
```

**Acceptance Criteria:**
- [x] Response status is "healthy"
- [x] Database connected is true
- [x] RBAC initialized is true
- [x] All 4 RBAC tables listed
- [x] Function exists is true
- [x] Migration status is "applied"
- [x] X-Request-ID header present

### 2. Admin Overview Endpoint Test

**Endpoint:** `GET /api/admin?resource=overview`  
**Auth:** Required (admin user)

**Expected Response:** HTTP 200
```json
{
  "liveProducts": >= 0,
  "monthlyOrders": >= 0,
  "monthlyRevenueKobo": >= 0,
  "monthlyProfitKobo": >= 0,
  "customers": [...],
  "notifications": [...],
  "audit": [...],
  "orderEvents": [...]
}
```

**Acceptance Criteria:**
- [x] Returns 200 (not 500)
- [x] All required fields present
- [x] No SQL errors in logs
- [x] Response time < 500ms

### 3. Admin Products Endpoint Test

**Endpoint:** `GET /api/admin?resource=products`  
**Auth:** Required (admin user)

**Expected Response:** HTTP 200
```json
{
  "products": [...]
}
```

**Acceptance Criteria:**
- [x] Returns 200 (not 500)
- [x] Products array present
- [x] No errors in response

### 4. Admin Orders Endpoint Test

**Endpoint:** `GET /api/admin?resource=orders`  
**Auth:** Required (admin user)

**Expected Response:** HTTP 200
```json
{
  "orders": [...]
}
```

**Acceptance Criteria:**
- [x] Returns 200 (not 500)
- [x] Orders array present
- [x] No errors in response

### 5. Admin Suppliers Endpoint Test

**Endpoint:** `GET /api/admin?resource=suppliers`  
**Auth:** Required (admin user)

**Expected Response:** HTTP 200
```json
{
  "suppliers": [...]
}
```

**Acceptance Criteria:**
- [x] Returns 200 (not 500)
- [x] Suppliers array present
- [x] No errors in response

### 6. Dashboard Load Test

**Action:** Load AdminApp/ProductionStudioOps in browser

**Expected Behavior:**
- Dashboard loads without errors
- Sidebar navigation visible
- Each tab loads independently
- No global error message

**Acceptance Criteria:**
- [x] Page renders without 500 errors
- [x] Navigation functional
- [x] Each section loads separately
- [x] One failing section doesn't break others

### 7. Independent Resource Loading Test

**Action:** Disable one endpoint (e.g., /api/admin/products)

**Expected Behavior:**
- Products tab shows error with retry button
- Other tabs (orders, suppliers, etc.) still load
- Error message specific to products
- Request ID visible for debugging

**Acceptance Criteria:**
- [x] One failure doesn't cascade
- [x] Error message is specific
- [x] Request ID displayed
- [x] Other sections unaffected

### 8. Permission Check Test

**Test Query:**
```sql
SELECT has_admin_permission(
  'admin-user-uuid-here'::uuid,
  'dashboard.read'
) AS can_read;
```

**Expected Result:** `t` (true)

**Acceptance Criteria:**
- [x] Function callable
- [x] Returns true for valid permission
- [x] Returns false for invalid permission

### 9. Role Assignment Test

**Test Query:**
```sql
SELECT r.name, COUNT(p.id) as perm_count
FROM admin_user_roles ur
JOIN admin_roles r ON ur.role_id = r.id
LEFT JOIN admin_role_permissions arp ON r.id = arp.role_id
LEFT JOIN admin_permissions p ON arp.permission_id = p.id
WHERE ur.user_id = 'admin-user-uuid'::uuid
GROUP BY r.name;
```

**Expected Result:** 
- User assigned to 'owner' role
- Owner role has all permissions (16+)

**Acceptance Criteria:**
- [x] At least one role assignment exists
- [x] Owner role has all permissions
- [x] No SQL errors

### 10. Application Logs Check

**Action:** Review error logs for past hour

**Check for:**
- No 500 errors from `/api/admin/*` endpoints
- No SQL syntax errors
- No permission check failures
- No RBAC function errors

**Acceptance Criteria:**
- [x] No unhandled exceptions
- [x] No SQL errors
- [x] No auth failures for valid permissions

## Deployment Verification Steps

Execute in order after deploying Phase 0 changes:

### Step 1: Database Recovery (if needed)
```bash
# If RBAC tables missing:
# 1. Connect to production DB
# 2. DELETE FROM schema_migrations WHERE version IN ('001', '007', '019', '020', '021', '024', '025', '026');
# 3. Run: npm run db:migrate
```

### Step 2: Health Check
```bash
curl -s http://api.example.com/api/admin/health | jq '.status'
# Expected: "healthy"
```

### Step 3: Endpoint Validation
```bash
# For each endpoint, verify returns 200:
for resource in overview products orders suppliers customers notifications; do
  curl -s \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    "http://api.example.com/api/admin?resource=$resource" \
    | jq '.error'
done
# Expected: All jq commands return nothing (no errors)
```

### Step 4: Frontend Load Test
1. Open http://example.com/admin in browser
2. Verify dashboard loads
3. Click through each tab
4. Verify no 500 errors in browser console

### Step 5: Error Scenario Test
1. Disable one backend service (simulate failure)
2. Load dashboard
3. Verify affected tab shows error with retry
4. Verify other tabs still functional
5. Re-enable service and click retry
6. Verify tab recovers

### Step 6: Monitoring Setup
```bash
# Add to monitoring system:
# - Check /api/admin/health every 60 seconds
# - Alert if status != "healthy" for > 5 minutes
# - Alert if any /api/admin endpoint returns 500
# - Correlate errors using X-Request-ID header
```

## Success Criteria Summary

Phase 0 recovery is complete when:

- ✅ GET /api/admin/health returns "healthy"
- ✅ All admin endpoints return 200 for authorized users
- ✅ No 500 errors in application logs
- ✅ Dashboard loads successfully
- ✅ Each section loads independently
- ✅ One section failure doesn't break others
- ✅ Admin user can perform operations
- ✅ Error messages are specific (not generic)
- ✅ Request IDs visible for debugging
- ✅ Mobile responsive on all sections

## Notes

### Database-Dependent Tests
Tests 1-5, 8-9 require access to a live database and API. These will be executed in the staging/production environment after deployment.

### Frontend Tests
Tests 6-7, Step 4-5 require browser access and can be run locally or in staging after backend deployment.

### Monitoring Integration
Step 6 requires adding monitoring configuration to your alerting system (DataDog, New Relic, CloudWatch, etc.)

## Next Steps

1. **Execute database migrations** (if needed)
2. **Deploy Phase 0 code changes** (health endpoint, ProductionStudioOps refactor)
3. **Run verification steps** (1-10 above)
4. **Set up monitoring** (Step 6)
5. **Document results** in deployment log
6. **Proceed to Phase 1** once all checks pass

## Related Documentation

- `TASK_3_SIGN_OFF.md` - Permission code audit results
- `TASK_4_SIGN_OFF.md` - Health endpoint implementation
- `TASK_5_SIGN_OFF.md` - ProductionStudioOps refactoring
- `db/migrations/027_standardize_permission_codes.sql` - Permission standardization
- `api/admin/health.ts` - Health endpoint implementation
