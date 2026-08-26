# Vura Admin Architecture - Visual Diagrams

---

## 1. Request Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Studio UI (React)                               │
│  AdminApp → ProductionStudioOps/FinanceView → OrderActionPanel      │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           │ fetch('/api/admin?resource=orders')
                           │ POST/PATCH body: {...}
                           │
                    ┌──────▼────────┐
                    │ POST /api/auth │  (login: email + password)
                    │ GET  /api/admin│  (all operations)
                    └──────┬─────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
    │applyHeaders│ │requireAdmin()│ │resource()  │
    │(CSP, etc)  │ │  (session)   │ │(?resource) │
    └────┬──────┘  └──────┬──────┘  └──────┬──────┘
         │                 │                │
         └─────────────────┼────────────────┘
                           │
                    ┌──────▼──────────────┐
                    │ routeToHandler()    │
                    │ via handlers map    │
                    └──────┬──────────────┘
                           │
         ┌─────────────────┼──────────────────────┐
         │                 │                      │
    ┌────▼────┐    ┌──────▼────┐      ┌────────▼─────┐
    │orders    │    │products    │      │delivery      │
    │suppliers │    │categories  │      │finance       │
    │customers │    │notifications│    │refunds       │
    └────┬────┘    └──────┬────┘      └────────┬─────┘
         │                 │                   │
         └─────────────────┼───────────────────┘
                           │
         ┌─────────────────▼────────────────────┐
         │  requireAdminPermission()            │
         │  (for delivery/finance/refunds only) │
         └─────────────────┬────────────────────┘
                           │
         ┌─────────────────▼────────────────────┐
         │  SQL Queries + Stored Procedures    │
         │  - commit_order_inventory()         │
         │  - release_order_inventory()        │
         │  - create_fulfillment()             │
         │  - update_fulfillment_status()      │
         └─────────────────┬────────────────────┘
                           │
    ┌──────────────────────┼──────────────────────┐
    │                      │                      │
┌───▼─────┐         ┌─────▼─────┐        ┌──────▼──────┐
│recordAudit(    │recordOrderEvent()  │sendEmail()    │
│before,after,   │  (state changes)   │notifyUser()   │
│metadata)       │                    │               │
└───┬─────┘      └─────┬─────┘        └──────┬────────┘
    │                  │                     │
┌───▼──────────────┐   │              ┌──────▼────────┐
│audit_log table   │   │              │Email/SMS queue │
│  (immutable)     │   │              │ + jobs runner  │
└─────────────────┘│   │              └────────────────┘
                   │   │
             ┌─────▼───▼─────┐
             │order_events    │
             │(immutable log) │
             └────────────────┘

    Response: JSON (200/201/400/403/404/405/500)
         │
    ┌────▼──────────┐
    │ UI updates    │
    │ (setState)    │
    │ + refetch     │
    └───────────────┘
```

---

## 2. Authentication & Authorization Flow

```
                  ┌──────────────────┐
                  │   Studio UI      │
                  │   Login Form     │
                  └────────┬─────────┘
                           │
                 email + password (HTTPS)
                           │
        ┌──────────────────▼──────────────────┐
        │POST /api/auth?action=signin         │
        │ req.body: {email, password}         │
        └──────────────────┬──────────────────┘
                           │
            ┌──────────────▼──────────────┐
            │1. Find user by email        │
            │2. bcrypt.compare(password)  │
            │3. validateAdmin()           │
            └──────────────┬───────────────┘
                           │
                  ✓ Valid Admin
                           │
         ┌─────────────────▼────────────────────┐
         │ createSession(req, res, userId)      │
         │                                      │
         │ 1. Generate: token = random(32)      │
         │ 2. Hash: tokenHash = SHA256(token)   │
         │ 3. Store: INSERT sessions            │
         │    - token_hash (not plaintext!)     │
         │    - user_id                         │
         │    - expires_at = now() + 30 days    │
         │    - user_agent, ip_address          │
         │ 4. Set Cookie:                       │
         │    - HttpOnly (no JS access)         │
         │    - Secure (HTTPS only)             │
         │    - SameSite=Strict                 │
         │    - Max-Age=2592000 (30 days)       │
         └─────────────────┬────────────────────┘
                           │
                  ┌────────▼─────────┐
                  │Response: 200 OK  │
                  │ Set-Cookie: ...  │
                  └────────┬─────────┘
                           │
                  ┌────────▼──────────────┐
                  │ Client stores cookie  │
                  │ (browser auto-sends   │
                  │  on future requests)  │
                  └─────────────────────┘


   ┌─────────────────────────────────────────────────────────────┐
   │             SUBSEQUENT REQUEST WITH SESSION                 │
   └─────────────────────────────────────────────────────────────┘

    GET /api/admin?resource=orders
    Cookie: vura_session=eyJ...

         │
    ┌────▼──────────────────────┐
    │ requireAdmin(req, res)     │
    │                            │
    │ 1. parseCookies(req)       │
    │ 2. getSessionUser(req):    │
    │    - Extract token from    │
    │      cookie                │
    │    - Hash it               │
    │    - SELECT from sessions  │
    │      WHERE token_hash = $1 │
    │      AND expires_at > now()│
    │ 3. Check user.role ===     │
    │    'admin'                 │
    └────┬─────────────────────┘
         │
    ✓ Authenticated & Authorized
         │
    ┌────▼────────────────────────────────────┐
    │ Proceed to handler                       │
    │ (admin.id is passed as 3rd argument)     │
    └────────────────────────────────────────┘


   ┌─────────────────────────────────────────────────────────────┐
   │  FOR SENSITIVE OPERATIONS (delivery/finance/refunds/payouts) │
   └─────────────────────────────────────────────────────────────┘

    1. Verify admin role ✓
         │
    2. requireAdminPermission(req, res, 'finance.read')
         │
    3. SELECT has_admin_permission(admin_id, 'finance.read')
         │
    4. Check:
       user → admin_user_roles
            → admin_role_permissions
            → admin_permissions
            WHERE code = 'finance.read'
         │
    ✓ Permission granted → Proceed
    ✗ Permission denied → 403 "You do not have permission..."
```

---

## 3. Order Lifecycle State Machine

```
                    ┌─────────────────────┐
                    │   NEW ORDER         │
                    │  (cart → order)     │
                    └──────────┬──────────┘
                               │
                ┌──────────────▼──────────────┐
                │  awaiting_payment           │
                │  + unpaid                   │
                │                             │
                │  • Payment details stored   │
                │  • Inventory reserved       │
                │  • Customer awaits transfer │
                └──────────────┬──────────────┘
                               │
              (Customer submits payment transfer)
                               │
                ┌──────────────▼──────────────────┐
                │ payment_verification           │
                │ + pending_verification         │
                │                                │
                │ • Admin verifies bank txn      │
                │ • Check: amount matches        │
                │ • Check: ref matches order     │
                │ • Manual or automated check    │
                └──────────────┬─────────────────┘
                               │
              (Admin approves or rejects payment)
                    ┌──────────┴──────────┐
                    │                     │
        ┌───────────▼──────────┐  ┌──────▼────────────┐
        │ APPROVED: paid       │  │ REJECTED: unpaid  │
        │                      │  │                   │
        │ commit_order_inventory  │ release_order_inv. │
        │ (active → committed) │  │ (active → release)│
        └───────────┬──────────┘  └─────┬──────────────┘
                    │                    │
        ┌───────────▼──────────┐         │
        │   confirmed          │         │
        │   + paid             │         │
        │                      │    (Order Failed)
        │ • Payment verified   │         │
        │ • Ready for sourcing │         │
        └───────────┬──────────┘    ┌────▼─────────┐
                    │               │  cancelled   │
              (Assign supplier)     │  + unpaid    │
                    │               │              │
        ┌───────────▼──────────┐    │ • Inventory  │
        │    sourcing          │    │   released   │
        │  + awating_confirmation │ • Refund issued│
        │                      │    └──────────────┘
        │ • Supplier assigned  │
        │ • Awaiting confirm   │
        └───────────┬──────────┘
                    │
              (Supplier confirms)
                    │
        ┌───────────▼──────────┐
        │    sourcing          │
        │  + confirmed         │
        │                      │
        │ • Supplier acquired  │
        │ • Ready to purchase  │
        └───────────┬──────────┘
                    │
              (Supplier purchased)
                    │
        ┌───────────▼──────────┐
        │    purchased         │
        │                      │
        │ • Supplier ready     │
        │ • Delivery arranged  │
        └───────────┬──────────┘
                    │
         (Create fulfillment)
                    │
        ┌───────────▼──────────┐
        │  out_for_delivery    │
        │  + fulfillment:      │
        │    in_transit        │
        │                      │
        │ • Courier in transit │
        │ • Tracking updates   │
        └───────────┬──────────┘
                    │
         (Delivery completed)
                    │
        ┌───────────▼──────────┐
        │    delivered         │
        │  + fulfillment:      │
        │    delivered         │
        │                      │
        │ • Order complete     │
        │ • Supplier payout    │
        │   eligible           │
        │ • Finance settled    │
        └──────────────────────┘

    ✗ CANCELLATION PATH (at any time)
                    │
                ┌───▼─────────┐
                │ cancelled   │
                │ + any status│
                │             │
                │ • Release   │
                │   inventory │
                │ • Void      │
                │   payment   │
                │ • Notify    │
                │   customer  │
                └─────────────┘


PAYMENT STATUS PARALLEL TRACK:
┌─────────────┐   ┌──────────────┐   ┌────────┐   ┌─────────┐
│ unpaid      │→  │pending_verif. │→  │ paid   │   │rejected │
└─────────────┘   └──────────────┘   └────────┘   └─────────┘
     (initial)      (under review)    (verified)   (declined)


SOURCING STATUS PARALLEL TRACK:
┌──────────────────┐   ┌──────────┐   ┌──────────┐   ┌────────────┐
│awaiting_confirm. │→  │confirmed │→  │sourcing  │→  │ purchased  │
└──────────────────┘   └──────────┘   └──────────┘   └─────┬──────┘
     (pending)          (agreed)      (in progress)        │
                                                           │
                        ┌─────────────────────────────────┤
                        │                                  │
                   ┌────▼───────────────────┐   ┌─────────▼──────┐
                   │out_for_delivery        │   │delivered       │
                   │(fulfillment created)   │   │(fulfillment)   │
                   └────┬──────────────────┘   └────────────────┘
                        │                        (end state)
                        │
                   (fulfillment status
                    transitions: pending
                    → preparing → dispatched
                    → in_transit → delivered)
```

---

## 4. Permission Model Hierarchy

```
┌────────────────────────────────────────────────────┐
│              ADMIN USERS (role='admin')             │
└────────────────────────┬───────────────────────────┘
                         │
        ┌────────────────▼────────────────┐
        │   admin_user_roles              │
        │                                 │
        │   user_id ──→ role_id           │
        │   (Many-to-many join)           │
        │                                 │
        └────────────────┬────────────────┘
                         │
        ┌────────────────▼────────────────┐
        │   admin_roles                   │
        │                                 │
        │   • owner (built-in)            │
        │   • finance_analyst             │
        │   • operations_manager          │
        │   • (custom roles...)           │
        │                                 │
        └────────────────┬────────────────┘
                         │
        ┌────────────────▼────────────────┐
        │  admin_role_permissions         │
        │                                 │
        │  role_id ──→ permission_id      │
        │  (Many-to-many join)            │
        │                                 │
        └────────────────┬────────────────┘
                         │
        ┌────────────────▼────────────────┐
        │   admin_permissions             │
        │                                 │
        │   id | code                     │
        │   ───┼────────────────────      │
        │    1 | finance.read             │
        │    2 | finance.write            │
        │    3 | orders.read              │
        │    4 | orders.update            │
        │    5 | deliveries.manage        │
        │    6 | refunds.create           │
        │    7 | payouts.manage           │
        │    8 | customers.privacy        │
        │    9 | sla.read                 │
        │   10 | courier.manage           │
        │                                 │
        └─────────────────────────────────┘

USAGE IN CODE:

async function requireAdminPermission(
  req: VercelRequest,
  res: VercelResponse,
  permission: string
) {
  const user = await requireAdmin(req, res);
  if (!user) return null;

  const rows = await sql`
    SELECT has_admin_permission(${user.id}, ${permission})
           AS allowed
  `;

  if (!rows[0]?.allowed) {
    res.status(403).json({
      error: 'You do not have permission to perform this action.'
    });
    return null;
  }

  return user;
}

QUERY (has_admin_permission function):

SELECT EXISTS (
  SELECT 1
  FROM admin_user_roles ur
  JOIN admin_role_permissions rp ON rp.role_id = ur.role_id
  JOIN admin_permissions p ON p.id = rp.permission_id
  WHERE ur.user_id = p_user_id
    AND p.code = p_permission
) AS allowed;

CURRENT STATE:
✗ All existing admin users get 'owner' role on migration
✗ 'owner' role likely has all permissions
✗ No UI to create new roles or assign permissions
✗ No multi-admin support documented
```

---

## 5. Inventory Coordination Flow

```
  CHECKOUT → CART → ORDER CREATION
        │
        │ Create order with status='awaiting_payment'
        │
        └──────────────────┬──────────────────┐
                           │                  │
                    ┌──────▼──────┐     ┌────▼──────┐
                    │ For each    │     │ Create    │
                    │ product in  │     │ inventory │
                    │ cart        │     │ reservation
                    └──────┬──────┘     └────┬──────┘
                           │                 │
                    ┌──────▼──────────────────▼──┐
                    │ INSERT inventory_reservations
                    │ (product_variant_id,
                    │  quantity,
                    │  order_id,
                    │  status='active')
                    │
                    │ Locks variant's available stock
                    │ Updates variant.stock_balance
                    └──────┬──────────────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        │   PAYMENT VERIFICATION              │
        └──────────────────┬──────────────────┘
                           │
              ┌────────────▼────────────┐
              │ Admin receives order    │
              │ in pending verification │
              │ queue                  │
              └────────────┬────────────┘
                           │
         ┌─────────────────┴─────────────────┐
         │                                   │
    ✓ APPROVED              ✗ REJECTED
         │                       │
    PATCH /api/admin          PATCH /api/admin
    resource=orders           resource=orders
    {orderId, paymentStatus   {orderId,
     = 'paid'}                paymentStatus
         │                    = 'rejected'}
         │                       │
    ┌────▼──────────────────┐   │
    │ IF nextPayment='paid'  │   │
    │ AND prevPayment!='paid'│   │
    │ {                      │   │
    │  commit_order_inventory│   │
    │  (orderId, adminId)    │   │
    │ }                      │   │
    │                        │   │
    │ FOR each active        │   │
    │ reservation:           │   │
    │  commit_inventory_     │   │
    │  reservation(resId)    │   │
    │   → status='committed' │   │
    │   → reserved_at = now()│   │
    │                        │   │
    └────┬───────────────────┘   │
         │                       │
    ┌────▼───────────────────┐   │
    │ Order workflow can     │   │
    │ continue:              │   │
    │ → sourcing             │   │
    │ → delivery             │   │
    │ → completed            │   │
    │                        │   │
    │ Inventory now safe:    │   │
    │ • Committed quantity   │   │
    │   locked to order      │   │
    │ • Cannot be re-sold    │   │
    │ • Cannot be cancelled  │   │
    │   except with release  │   │
    └────────────────────────┘   │
                                 │
                        ┌────────▼──────────┐
                        │ IF paymentStatus  │
                        │ = 'rejected' OR   │
                        │ order.status =    │
                        │ 'cancelled'       │
                        │ {                 │
                        │  release_order_   │
                        │  inventory(       │
                        │    orderId,       │
                        │    reason,        │
                        │    adminId        │
                        │  )                │
                        │ }                 │
                        │                   │
                        │ FOR each active   │
                        │ reservation:      │
                        │  release_inventory│
                        │  _reservation()   │
                        │   → status='rel.' │
                        │   → released_at   │
                        │     = now()       │
                        │   → returns qty   │
                        │     to available  │
                        │                   │
                        └────┬──────────────┘
                             │
                        ┌────▼──────────┐
                        │ Customer can  │
                        │ re-order      │
                        │ variant is    │
                        │ available     │
                        │ again         │
                        │               │
                        │ Finance: no   │
                        │ charge to     │
                        │ customer      │
                        │ Audit log     │
                        │ records all   │
                        │ changes       │
                        └───────────────┘

VARIANT STOCK BALANCE FORMULA:
available = total - reserved_active - committed
            (across all orders)

GUARDRAILS:
✓ Variants.stock_balance is "source of truth"
✓ Inventory moves are logged (INSERT only)
✓ No deletions (immutable history)
✓ Concurrent checkout uses SELECT FOR UPDATE
✓ Multi-product orders atomic at DB level
  (single commit_order_inventory() call)
```

---

## 6. Audit & Event Logging

```
┌─────────────────────────────────────────┐
│      EVERY ADMIN MUTATION                │
└──────────────────┬──────────────────────┘
                   │
    ┌──────────────▼──────────────┐
    │ recordAudit({               │
    │   actorUserId,              │
    │   action: 'order.update',   │
    │   entityType: 'order',      │
    │   entityId,                 │
    │   beforeData,               │
    │   afterData,                │
    │   metadata                  │
    │ })                          │
    └──────────────┬──────────────┘
                   │
    ┌──────────────▼──────────────────────────┐
    │ INSERT INTO audit_log (                 │
    │   id (UUID),                            │
    │   actor_user_id,                        │
    │   action,                               │
    │   entity_type,                          │
    │   entity_id,                            │
    │   before_data (JSON),                   │
    │   after_data (JSON),                    │
    │   metadata (JSON),                      │
    │   created_at                            │
    │ )                                       │
    └──────────────┬──────────────────────────┘
                   │
    ┌──────────────▼──────────────────────────┐
    │ audit_log table (immutable)              │
    │ - Ordered by created_at DESC            │
    │ - No updates, no deletes                │
    │ - New audits always append              │
    │ - Limit 200 recent in overview          │
    │ - Searchable by entity_id, action, actor│
    └──────────────┬──────────────────────────┘
                   │
                   │ (separate thread)
                   │
    ┌──────────────▼──────────────────────────┐
    │ recordOrderEvent({                      │
    │   orderId,                              │
    │   eventType: 'order.status_changed',    │
    │   fromStatus: 'awaiting_payment',       │
    │   toStatus: 'confirmed',                │
    │   note: 'Admin operational update',     │
    │   metadata,                             │
    │   actorUserId                           │
    │ })                                      │
    └──────────────┬──────────────────────────┘
                   │
    ┌──────────────▼──────────────────────────┐
    │ INSERT INTO order_events (              │
    │   id (UUID),                            │
    │   order_id,                             │
    │   event_type,                           │
    │   from_status,                          │
    │   to_status,                            │
    │   note,                                 │
    │   metadata (JSON),                      │
    │   created_at,                           │
    │   actor_user_id                         │
    │ )                                       │
    └──────────────┬──────────────────────────┘
                   │
    ┌──────────────▼──────────────────────────┐
    │ order_events table (immutable)          │
    │ - Order-scoped event log                │
    │ - Ordered by created_at ASC             │
    │ - Shows full lifecycle per order        │
    │ - Used for order status feed            │
    │ - Limit 300 recent in overview          │
    └──────────────┬──────────────────────────┘
                   │
                   │ (async: notifications)
                   │
    ┌──────────────▼──────────────────────────┐
    │ IF stateChanged:                        │
    │  sendCustomerNotification(              │
    │    buyer_email,                         │
    │    orderId,                             │
    │    newStatus,                           │
    │    newPaymentStatus                     │
    │  )                                      │
    └──────────────┬──────────────────────────┘
                   │
    ┌──────────────▼──────────────────────────┐
    │ INSERT INTO notifications (             │
    │   id (UUID),                            │
    │   user_id,                              │
    │   order_id,                             │
    │   type: 'order_status',                 │
    │   title,                                │
    │   body,                                 │
    │   created_at                            │
    │ )                                       │
    │                                         │
    │ SEND: Email (via email provider)        │
    │       SMS/WhatsApp (via notification)   │
    └──────────────┬──────────────────────────┘
                   │
    ┌──────────────▼──────────────────────────┐
    │ INSERT INTO email_retry (               │
    │   id (UUID),                            │
    │   notification_id,                      │
    │   subject, text, html,                  │
    │   recipient_email,                      │
    │   status: 'pending',                    │
    │   retry_count: 0,                       │
    │   next_retry_at: now() + 5 min          │
    │ )                                       │
    │                                         │
    │ Background job runner:                  │
    │ scripts/jobs-runner.ts                  │
    │  → checks pending emails                │
    │  → retries up to N times                │
    │  → exponential backoff                  │
    │  → dead-letter after failures           │
    └──────────────────────────────────────────┘

ACTIONS LOGGED:
├─ product.create
├─ product.update
├─ supplier.create
├─ supplier.update
├─ order.update
├─ fulfillment.create
├─ fulfillment.status_update
├─ refund.requested
├─ refund.approved
├─ rma.created
└─ rma.approved

EVENT TYPES LOGGED:
├─ payment.paid
├─ payment.rejected
├─ payment.pending_verification
├─ sourcing.confirmed
├─ sourcing.sourcing
├─ order.confirmed
├─ fulfillment_created
├─ fulfillment_status_changed
├─ refund_requested
├─ refund_approved
├─ rma_created
└─ rma_approved

OBSERVABILITY:
1. Overview dashboard shows recent audit + events
2. Studio can filter audit by entity, action, date
3. Order details show full event timeline
4. Finance reports correlate with audit events
5. Compliance: immutable log for disputes
```

---

## 7. Refund & RMA State Machines

```
┌────────────────────────────┐
│   REFUND LIFECYCLE         │
└────────────────┬───────────┘
                 │
        ┌────────▼────────┐
        │  requested      │
        │                 │
        │ • Created by    │
        │   admin or      │
        │   customer      │
        │ • Amount        │
        │   validated     │
        │ • Idempotent key│
        │                 │
        └────────┬────────┘
                 │
         (Admin reviews)
                 │
        ┌────────┴────────┐
        │                 │
    ┌───▼───┐        ┌────▼────┐
    │approved│       │rejected  │
    │        │       │          │
    └───┬───┘       └──────────┘
        │           (end state)
        │
    ┌───▼───────────┐
    │  processing   │
    │               │
    │ • Funds       │
    │   prepared    │
    │ • Moving to   │
    │   ledger      │
    │               │
    └───┬───────────┘
        │
    ┌───▼───────────┐
    │  completed    │
    │               │
    │ • Refund      │
    │   issued      │
    │ • Finance     │
    │   settled     │
    │ • Customer    │
    │   notified    │
    │               │
    └───────────────┘
    (end state)

    ✗ FAILED STATE:
        processing → failed
        (reversal, retry logic)

┌────────────────────────────┐
│   RMA LIFECYCLE            │
└────────────────┬───────────┘
                 │
        ┌────────▼──────────┐
        │   requested       │
        │                   │
        │ • RMA number      │
        │   generated       │
        │ • Return reason   │
        │   captured        │
        │ • Fulfillment ID  │
        │   optional        │
        │                   │
        └────────┬──────────┘
                 │
         (Admin reviews)
                 │
        ┌────────┴──────────┐
        │                   │
    ┌───▼──────┐    ┌───────▼──┐
    │ approved │    │ rejected  │
    │          │    │           │
    └───┬──────┘    └───────────┘
        │           (end state)
        │
    ┌───▼─────────────────┐
    │ return_in_transit   │
    │                     │
    │ • Customer ships    │
    │   item back         │
    │ • Tracking updates  │
    │                     │
    └───┬─────────────────┘
        │
    ┌───▼─────────────────┐
    │   received          │
    │                     │
    │ • Item arrived      │
    │   at warehouse      │
    │ • QC check ready    │
    │                     │
    └───┬─────────────────┘
        │
    ┌───▼─────────────────┐
    │   inspecting        │
    │                     │
    │ • QC team checks    │
    │   condition         │
    │ • Determine outcome │
    │                     │
    └───┬─────────────────┘
        │
    ┌───┴─────────────┬────────────┐
    │                 │            │
┌───▼────────┐  ┌────▼────────┐  │
│  refunded  │  │ replaced    │  │
│            │  │             │  │
│ • Credit   │  │ • Replacement
│   issued   │  │   shipped   │  │
│ • Finance  │  │ • New item  │  │
│   settled  │  │   expected  │  │
│            │  │             │  │
└────────────┘  └─────────────┘  │
(end state)     (end state)      │
                                  │
                        ┌─────────▼──────┐
                        │  cancelled     │
                        │                │
                        │ • RMA voided   │
                        │ • No action    │
                        │                │
                        └────────────────┘
                        (end state)

BOTH FLOWS:
✓ Immutable audit trail
✓ Idempotent operations (refund request)
✓ Async notification to customer
✓ Finance ledger impact on completion
✓ Supplier impact (inventory restock)
```

---

## 8. Current Gaps & Roadmap

```
┌─────────────────────────────────────────────┐
│  ADMIN SYSTEM MATURITY ROADMAP              │
└─────────────────────────────────────────────┘

✅ COMPLETED (v0.1)
├─ Admin authentication (session-based)
├─ Order state machine (payment/sourcing/delivery)
├─ Product CRUD
├─ Supplier management
├─ Financial overview
├─ Refund/RMA creation & approval
├─ Fulfillment management
├─ Audit logging
├─ Basic RBAC (owner role)
└─ Email notifications

⚠️  PARTIAL/INCOMPLETE (v0.2)
├─ Permission UI (no role editor)
├─ Concurrent edit protection (no locking)
├─ Multi-admin support (untested)
├─ Refund processing (created but not processing)
├─ RMA QC workflow (created but not inspecting)
├─ Delivery manual override (partial)
├─ Pagination & filtering (basic LIMIT)
├─ Real-time dashboard updates (polling only)
└─ Manifest printing (PDF utils exist)

❌ NOT IMPLEMENTED (v0.3+)
├─ Multi-item orders (cart model missing)
├─ Variant/SKU inventory
├─ Split fulfillments by supplier
├─ Customer privacy export
├─ Advanced RMA inspection workflow
├─ Payout processing UI (API tests only)
├─ Courier webhook retry/DLQ
├─ Email retry dashboard
├─ SLA tracking UI
├─ Bulk operations (CSV import)
└─ AI-assisted operations

PRIORITY FOR NEXT SPRINT:
1. Add permission check to overview endpoint
2. Implement concurrent edit protection
3. Complete refund processing workflow
4. Add role management UI
5. Multi-item order support
```

---

End of diagrams document
