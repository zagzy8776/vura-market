# Vura Production Hardening — Execution Contract

## Non-negotiable

- No mock mutations.
- No UI-only success states.
- No secrets in source control.
- Do not add one Vercel function per feature; use the consolidated admin API architecture.
- Every sensitive mutation is server-authorized and validated.
- Every financial mutation is idempotent and auditable.
- Every asynchronous notification/webhook can retry safely.
- Production readiness requires passing tests and deployment smoke tests; a successful compile alone is not sufficient.

## P0

### Orders
- Real order detail workspace.
- Payment verification/rejection.
- Order/sourcing status transitions with allowed-transition validation.
- Supplier assignment.
- Purchase/delivery/other costs.
- Actual profit calculation.
- Timeline and audit history.
- Concurrency-safe updates and clear conflict/error feedback.

### Products
- Create/edit.
- Publish/unpublish.
- Price and source cost.
- Supplier and source location.
- Stock state.
- Image management.
- Variant/SKU foundation.

### Suppliers
- Create/edit.
- Product relationships.
- SLA/reliability tracking.
- Validation of score and supplier data.

### Delivery
- Fulfillment records.
- Shipment/tracking number.
- Courier assignment.
- Tracking timeline.
- Manual fallback when courier integration is unavailable.

### Studio UX
- Loading states.
- Toast feedback.
- Empty/error states.
- Destructive-action confirmations.
- Pagination.
- Search/filter/sort.
- Refresh/polling cleanup.

## P1 — Transaction integrity

- Split fulfillment by supplier/courier.
- Variant-level inventory.
- Reservation/release/sale/return inventory movements.
- Payment transaction records and idempotency keys.
- Immutable ledger entries.
- Full/partial refunds.
- RMA workflow.
- Supplier payout holds/eligibility.
- Reconciliation.
- Idempotent notification delivery.
- Retry/dead-letter jobs.
- RBAC with finance/report permissions.

## P2 — Scale and growth

- Finance/reporting dashboards.
- CSV/PDF exports.
- Nigeria state/LGA/location dataset and validated address flow.
- SEO metadata, sitemap, structured product/category data.
- Coupon/promotion engine.
- Customer segmentation and lifecycle messaging.
- AI customer/operations assistants backed only by authoritative database tools.

## Verification gates

1. npm install is deterministic and lockfile is synchronized.
2. lint passes.
3. app typecheck passes.
4. API typecheck passes.
5. unit/integration tests pass.
6. production build passes.
7. migration applies successfully in a non-production database first.
8. payment duplicate/retry tests pass.
9. notification duplicate/retry tests pass.
10. inventory oversell/race tests pass.
11. refund/ledger reconciliation tests pass.
12. RBAC authorization tests pass.
13. customer checkout-to-delivery E2E passes.
14. production deployment smoke tests pass.
