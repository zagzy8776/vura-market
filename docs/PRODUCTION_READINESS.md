# Vura Production Readiness Roadmap

This document is the implementation contract for taking Vura from the current commerce storefront/Studio foundation to a production-grade commerce operating system.

## Non-negotiable principles

- Database is the source of truth.
- Financial history is append-only; corrections use new ledger entries.
- Every sensitive mutation is authorized server-side and audited.
- Payment, webhook, notification, inventory and job operations are idempotent.
- Customer-facing answers must use authoritative catalog/order data, not model guesses.
- New Vercel functions are not created per feature; extend the consolidated API architecture to avoid Hobby function limits.
- No production verdict is given until build, typecheck, tests, security and end-to-end money-flow checks pass.

## Workstreams

### P0 — Current Studio operations

- Order detail workspace/drawer.
- Real order status/payment/sourcing mutations.
- Supplier assignment.
- Purchase, delivery and other cost capture.
- Actual profit calculation.
- Payment verification/rejection with audit events.
- Product create/edit/publish/stock management.
- Supplier create/edit.
- Delivery workspace and manual tracking override.
- Toasts, loading states, confirmation dialogs and mutation errors.
- Server-side pagination/filtering/sorting.

### P1 — Commerce correctness

- Multi-item cart/order model.
- Split fulfillments by supplier/courier.
- Variant/SKU inventory.
- Inventory reservation/release/sale/return movements.
- RMA/returns.
- Partial refunds.
- Courier webhook processing, retry and dead-letter recovery.

### P1 — Money integrity

- Payment transaction records.
- Idempotent payment handling.
- Immutable ledger.
- Customer funds pending/held until the applicable fulfillment condition.
- Supplier payout eligibility and payout records.
- Reconciliation dashboard.
- Finance reports and exports.

### P1 — Operations automation

- Notification event records.
- Idempotent email/WhatsApp/SMS delivery records.
- Background job queue.
- Retry/dead-letter handling.
- Low-stock and supplier SLA alerts.

### P1 — Security and administration

- Permission-based RBAC.
- Finance/report access restricted by permission.
- Sensitive-action reauthentication where appropriate.
- Rate limiting.
- Input validation.
- Security headers/CSP/CORS.
- Environment validation.
- Structured request/error logging.
- Audit trail for sensitive actions.

### P2 — Customer and growth

- Customer privacy export/anonymization workflow.
- SEO-friendly category/product pages.
- Structured product metadata.
- Search/indexing strategy.
- Coupon/promotion engine.
- Customer segmentation.
- Abandoned-cart/re-engagement workflows.

### P2 — AI layer

AI is added after the transactional system is trustworthy.

- Operations assistant for owner/admin.
- Customer storefront assistant.
- Order/tracking assistant.
- Catalog/sourcing assistant.
- Sales and growth assistant.
- Strict tool permissions and data boundaries.
- No secret/environment/database credential exposure.
- AI responses for prices, stock, orders and tracking must come from live authoritative data.

## Customer journey acceptance test

1. Customer opens storefront.
2. Browses category.
3. Opens product.
4. Chooses variant/quantity.
5. Adds to cart.
6. Reviews complete cart total.
7. Enters name, phone, WhatsApp, email and delivery address.
8. Selects/receives the configured Vura payment instructions.
9. Order is created exactly once.
10. Payment submission is scoped to the owning customer/order.
11. Admin receives an operational notification.
12. Payment is verified exactly once.
13. Order becomes eligible for sourcing.
14. Supplier/fulfillment is assigned.
15. Tracking is created.
16. Customer receives status updates without duplicates.
17. Delivery is confirmed.
18. Supplier payout becomes eligible according to the configured policy.
19. Finance ledger reconciles.
20. Customer can see the final order state.

## Failure acceptance tests

- Duplicate checkout request.
- Duplicate payment submission.
- Duplicate payment webhook.
- Payment rejection.
- Payment reversal.
- Supplier unavailable.
- Split supplier fulfillment.
- Courier webhook timeout.
- Courier duplicate webhook.
- Courier event dead-letter retry.
- Notification provider timeout.
- Duplicate notification retry.
- Inventory race/oversell attempt.
- Variant reaches zero stock.
- Partial refund.
- Full refund.
- Return/RMA.
- Unauthorized finance access.
- Concurrent admin edits.
- Customer privacy request.

## Production gates

- `npm run lint` clean or explicitly reviewed/waived with tracked issues.
- `npm run typecheck` clean.
- `npm run typecheck:api` clean.
- Test suite green.
- Production build green.
- Migration reviewed and applied in staging before production.
- No secrets in git.
- Admin authorization verified on every mutation.
- Financial reconciliation tests pass.
- End-to-end checkout/payment/order/delivery test passes.
- Failure/retry/dead-letter tests pass.
- Production smoke test passes after deployment.

## Current starting point

The repository already has a consolidated admin API, live Studio data, audit log/order events, bank-transfer payment configuration, guest claim flow and automated tests. The next implementation work must extend that foundation rather than reintroduce split admin functions or a second router.
