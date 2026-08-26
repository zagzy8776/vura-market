# Vura Admin System - Quick Reference Guide

---

## API Endpoints

| Endpoint | Methods | Permission | Purpose |
|----------|---------|-----------|---------|
| `/api/admin?resource=overview` | GET | (none) | Dashboard metrics ⚠️ *should require finance.read* |
| `/api/admin?resource=orders` | GET, PATCH | (none) GET / implicit UPDATE | List orders / Update status+costs+payment |
| `/api/admin?resource=products` | GET, POST, PATCH | (none) | CRUD products |
| `/api/admin?resource=suppliers` | GET, POST, PATCH | (none) | CRUD suppliers |
| `/api/admin?resource=categories` | GET | (none) | Read categories |
| `/api/admin?resource=customers` | GET | (none) | List customers by spend |
| `/api/admin?resource=notifications` | GET | (none) | Recent notifications log |
| `/api/admin?resource=delivery` | GET, POST, PATCH | deliveries.manage | Fulfillment CRUD |
| `/api/admin?resource=finance` | GET | finance.read | Financial reporting |
| `/api/admin?resource=refunds` | GET, POST, PATCH | finance.read / refunds.create | Refund & RMA ops |

---

## Auth Flow

```
1. POST /api/auth?action=signin {email, password}
   ↓ (verify admin role + password match)
2. createSession() → generate token → store hash in DB
3. Set-Cookie: vura_session (HttpOnly, Secure, 30 days)
4. Future requests: cookie auto-sent, getSessionUser() validates
5. POST /api/auth?action=signout → destroySession()
```

---

## Key State Machines

### Order Status
```
awaiting_payment → payment_verification → confirmed → sourcing 
                                              ↓
                                        (purchased → out_for_delivery → delivered)
                                              ↓
                                          cancelled (anytime)
```

### Payment Status
```
unpaid → pending_verification → paid
                ↓
             rejected
```

### Fulfillment Status
```
pending → preparing → dispatched → in_transit → delivered
            ↓ ↓ ↓                     ↓
          failed, cancelled
```

---

## Inventory Coordination

| Event | Action | Result |
|-------|--------|--------|
| Order created | Reserve qty | Status = `active` |
| Payment approved (paid) | `commit_order_inventory()` | active → `committed` |
| Payment rejected or order cancelled | `release_order_inventory()` | active → `released`, qty returns to available |

---

## Order PATCH Parameters

```json
{
  "orderId": "uuid",
  "status": "confirmed",
  "paymentStatus": "paid",
  "sourcingStatus": "confirmed",
  "supplierId": "uuid",
  "purchaseCostKobo": 50000,
  "deliveryFeeKobo": 5000,
  "otherCostKobo": 1000
}
```

**Profit Calculated Automatically**:
```
profit = total_kobo - purchase_cost - delivery_fee - other_cost
```

---

## Refund Flow

```
POST /api/admin?resource=refunds (action: 'refund')
{
  "orderId": "uuid",
  "amountKobo": 5000,
  "reason": "Defective item",
  "idempotencyKey": "refund:..."
}
↓
Status = 'requested'
↓
PATCH /api/admin?resource=refunds (action: 'refund_approve')
{
  "refundId": "uuid"
}
↓
Status = 'approved'
↓
(Admin internally: moves through processing → completed)
↓
Customer notified + Finance settled
```

---

## RMA Flow

```
POST /api/admin?resource=refunds (action: 'rma')
{
  "orderId": "uuid",
  "reason": "Customer wants to return",
  "fulfillmentId": "uuid",
  "customerNote": "Item defective"
}
↓
Status = 'requested', RMA# generated
↓
PATCH /api/admin?resource=refunds (action: 'rma_approve')
{
  "rmaId": "uuid"
}
↓
Status = 'approved'
↓
Customer ships back → return_in_transit
Item arrives → received
QC checks → inspecting
Outcome: refunded / replaced / rejected
```

---

## Fulfillment PATCH

```json
{
  "fulfillmentId": "uuid",
  "status": "dispatched",
  "message": "Package left warehouse",
  "location": "Lagos, Nigeria",
  "trackingNumber": "XYZ123",
  "courierName": "DHL"
}
```

---

## Permission Matrix

| Resource | GET | POST | PATCH | Permission Check |
|----------|-----|------|-------|------------------|
| overview | ✓ | — | — | ❌ (should be finance.read) |
| orders | ✓ | — | ✓ | ❌ (should check) |
| products | ✓ | ✓ | ✓ | ❌ |
| suppliers | ✓ | ✓ | ✓ | ❌ |
| categories | ✓ | — | — | ❌ |
| customers | ✓ | — | — | ❌ |
| notifications | ✓ | — | — | ❌ |
| delivery | ✓ | ✓ | ✓ | ✅ deliveries.manage |
| finance | ✓ | — | — | ✅ finance.read |
| refunds | ✓ | ✓ | ✓ | ✅ refunds.create |

---

## Error Responses

| Code | Meaning | Common Causes |
|------|---------|---------------|
| 401 | Unauthorized | No session / expired session |
| 403 | Forbidden | Not admin role / insufficient permission |
| 404 | Not found | Order/Product/Supplier not found |
| 405 | Method not allowed | POST on GET-only resource |
| 400 | Bad request | Invalid input / validation failed |
| 409 | Conflict | Refund > remaining / RMA state invalid |
| 500 | Server error | DB error / unhandled exception |

---

## Audit Logging

**Every mutation is logged**:
- Product create/update → `product.create` / `product.update`
- Order update → `order.update`
- Fulfillment changes → `fulfillment.create` / `fulfillment.status_update`
- Refund/RMA → `refund.requested` / `rma.approved` / etc.

**Stored with**:
- Actor: who did it (admin_user_id)
- Timestamp: when
- Before/after JSON: what changed
- Metadata: context

**Query**:
```sql
SELECT * FROM audit_log 
  WHERE entity_type = 'order' AND entity_id = $1
  ORDER BY created_at DESC;
```

---

## Admin Roles

**Current State**:
- All existing admins get `owner` role
- `owner` role has all permissions
- No other roles defined
- No UI to create roles

**Permissions Available** (defined but not all used):
- `finance.read` - View finance dashboard
- `finance.write` - Issue refunds (not fully implemented)
- `orders.read` - View orders (not checked)
- `orders.update` - Mutate orders (not checked)
- `orders.write` - Alias
- `deliveries.read` - View fulfillments
- `deliveries.manage` - Mutate fulfillments ✅ Used
- `refunds.create` - Create refunds ✅ Used
- `payouts.read` - View supplier payouts
- `payouts.manage` - Create/settle payouts ✅ Used
- `customers.privacy` - Export/anonymize customers
- `sla.read` - View courier SLA
- `courier.manage` - Configure courier webhooks

---

## Studio UI Sections

### Operations Tab
- **Overview**: Dashboard metrics + recent activity
- **Payments**: Verification queue + paid orders
- **Sourcing**: Paid orders awaiting purchasing/delivery
- **Orders**: Full order management
- **Products**: Product inventory + pricing
- **Suppliers**: Supplier list + reliability scores
- **Notifications**: Notification audit log
- **Audit**: Full activity log

### Finance Tab
- Summary cards: orders, revenue, costs, profit
- Monthly trend chart
- Payment distribution
- Sourcing distribution

---

## Database Tables

| Table | Key Fields | Purpose |
|-------|-----------|---------|
| `orders` | id, order_number, status, payment_status, sourcing_status, total_kobo, actual_profit_kobo | Order lifecycle |
| `products` | id, name, price_kobo, stock_status, supplier_id, category_id | Product catalog |
| `suppliers` | id, name, location, reliability_score | Supplier master |
| `inventory_reservations` | id, order_id, product_variant_id, status (active/committed/released) | Stock reservation per order |
| `order_fulfillments` | id, order_id, supplier_id, status, tracking_number, courier_name | Shipment records |
| `delivery_events` | fulfillment_id, status, message, location, external_event_id | Delivery updates |
| `refunds` | id, order_id, amount_kobo, status (requested/approved/processing/completed/rejected) | Refund requests |
| `return_requests` | id, rma_number, order_id, status (requested/approved/return_in_transit/received/inspecting/refunded/replaced/rejected) | RMA records |
| `audit_log` | id, actor_user_id, action, entity_type, entity_id, before_data, after_data, metadata | Immutable audit trail |
| `order_events` | id, order_id, event_type, from_status, to_status, metadata, actor_user_id | Order status history |
| `notifications` | id, user_id, order_id, type, title, body, created_at | Notification log |
| `email_retry` | id, notification_id, status (pending/sent/failed), retry_count, next_retry_at | Email retry queue |

---

## Common Tasks

### Verify a Payment
```json
PATCH /api/admin?resource=orders
{
  "orderId": "order-uuid",
  "paymentStatus": "paid"
}
→ commit_order_inventory() called automatically
→ Customer notified
→ Order eligible for sourcing
```

### Reject a Payment
```json
PATCH /api/admin?resource=orders
{
  "orderId": "order-uuid",
  "paymentStatus": "rejected"
}
→ release_order_inventory() called automatically
→ Stock returned to available
→ Customer notified
```

### Assign Supplier & Costs
```json
PATCH /api/admin?resource=orders
{
  "orderId": "order-uuid",
  "supplierId": "supplier-uuid",
  "purchaseCostKobo": 50000,
  "deliveryFeeKobo": 5000,
  "otherCostKobo": 1000
}
→ profit calculated: total - costs
→ Order workflow continues
```

### Create Fulfillment
```json
POST /api/admin?resource=delivery
{
  "orderId": "order-uuid",
  "deliveryAddress": "123 Main St, Lagos",
  "courierName": "DHL",
  "trackingNumber": "XYZ123"
}
→ fulfillmentId returned
→ Customer tracking available
```

### Request Refund
```json
POST /api/admin?resource=refunds
{
  "orderId": "order-uuid",
  "amountKobo": 50000,
  "reason": "Defective product",
  "idempotencyKey": "refund:order-uuid:50000:defective"
}
→ Status: 'requested'
→ Audit logged
```

### Approve Refund
```json
PATCH /api/admin?resource=refunds
{
  "action": "refund_approve",
  "refundId": "refund-uuid"
}
→ Status: 'approved'
→ Finance settles on processing
→ Customer eventually notified
```

---

## Performance Notes

- Overview queries: All parallel (`Promise.all`)
- Orders list: LIMIT 500 (no pagination)
- Products list: LIMIT 500 (no pagination)
- Dashboard: Recent 200 audit, 300 events, 300 notifications
- Fulfillment events: Joined for each fulfillment (N+1 avoidable)

---

## Security Checklist

- ✅ Session tokens hashed (SHA256) in DB
- ✅ Cookies HttpOnly + Secure + SameSite=Strict
- ✅ Admin role required before any operation
- ✅ Permission checks on sensitive endpoints
- ✅ All mutations logged with actor
- ✅ Input validation on amounts, statuses, etc.
- ⚠️ Missing: Concurrent edit protection
- ⚠️ Missing: Rate limiting on endpoints
- ⚠️ Missing: Permission check on overview endpoint

---

## Known Issues

1. **Overview endpoint has no permission check** → should require `finance.read`
2. **Orders, products, suppliers don't check permissions** → anyone admin can mutate anything
3. **No concurrent edit protection** → simultaneous updates could conflict
4. **Refund processing incomplete** → created/approved but processing→completed flow not visible
5. **RMA inspection workflow incomplete** → received→inspecting→outcome incomplete
6. **Multi-item orders not supported** → single product per order only
7. **Pagination hardcoded to LIMIT** → no offset/limit params

---

## Roadmap Notes

**Next Sprint**:
- [ ] Add permission check to overview
- [ ] Implement optimistic locking for concurrent edits
- [ ] Complete refund processing workflow
- [ ] Add role/permission management UI
- [ ] Multi-item order support

**Q2**:
- [ ] Customer privacy export
- [ ] Advanced RMA workflow
- [ ] Payout processing UI
- [ ] Email retry dashboard
- [ ] Bulk CSV operations

**Q3**:
- [ ] Real-time dashboard updates
- [ ] AI-assisted operations assistant
- [ ] Advanced analytics
- [ ] Competitor pricing integration

---

**Last Updated**: Current session  
**Version**: Admin v0.2 (partial RBAC, core operations complete)  
**Status**: Production-ready with known gaps noted above
