# Vura Production Build Status

## Current implementation target

This branch (`feat/production-hardening`) is the production-hardening track. The existing Studio is a live-data operations shell, but several visible sections are still read-only. The backend already exposes real order/product/supplier mutations and records audit/order events; the next UI work must wire those mutations into authenticated controls.

## Immediate P0 implementation

1. Order detail drawer
   - Open an order from the Orders table.
   - Show payment, order, sourcing and delivery state.
   - Verify/reject payment through the consolidated admin API.
   - Change order/sourcing status.
   - Assign supplier.
   - Record purchase, delivery and other costs.
   - Show calculated actual profit.
   - Show immutable order event history.
   - Require confirmation for destructive/reversing actions.

2. Product management
   - Add product form.
   - Edit product price, stock state, supplier and source information.
   - Activate/deactivate product.
   - Add image upload using the existing storage integration.
   - Prepare variant/SKU editing against the new migration.

3. Supplier management
   - Add supplier.
   - Edit supplier.
   - Show reliability/SLA indicators.
   - Prevent invalid reliability values.

4. Delivery workspace
   - Create/update fulfillment records.
   - Assign courier/supplier.
   - Manual tracking number entry.
   - Timeline of tracking events.
   - Failed delivery state and manual recovery.

5. Studio UX reliability
   - Toasts.
   - Mutation loading states.
   - Empty/error states.
   - Confirmation dialogs.
   - Pagination/filtering/sorting.
   - Polling with cleanup.

## P1 transaction correctness

- Multi-item orders instead of the current single-product order shape.
- Split fulfillment.
- Variant inventory reservation/release/sale/return movements.
- Payment transaction records.
- Idempotency keys.
- Ledger entries for every financial mutation.
- Partial and full refunds.
- RMA workflow.
- Supplier payout eligibility and payout records.
- Reconciliation report.
- Notification delivery records and retry/dead-letter jobs.

## P1 security

- Permission-level RBAC, not only the current admin/customer gate.
- Finance/report endpoints require explicit permissions.
- Zod or equivalent schema validation at API boundaries.
- Rate limiting on authentication and sensitive admin mutations.
- CSP/security headers and restricted CORS.
- Environment validation.
- Structured error/request logging.
- Sensitive-action reauthentication where justified.

## P2 growth/AI

- SEO category/product pages.
- Coupon/promotion engine.
- Customer segmentation.
- Abandoned-cart workflows.
- Customer support/storefront assistant using authoritative database tools only.
- Operations assistant for order/payment/sourcing exceptions.
- Sales/growth assistant.
- Automated promotional notifications.

## Production verdict rule

Do not call Vura production-ready until:

- lint/typecheck/typecheck:api are clean or explicitly tracked waivers exist;
- tests are green;
- production build succeeds;
- migration is reviewed and successfully applied in staging;
- all admin mutations are server-authorized;
- money-flow and ledger reconciliation tests pass;
- duplicate payment/notification/webhook tests pass;
- inventory race/oversell tests pass;
- checkout -> payment -> sourcing -> fulfillment -> delivery passes end-to-end;
- failure/dead-letter recovery is tested;
- production smoke tests pass after deployment;
- no credentials/secrets are committed.
