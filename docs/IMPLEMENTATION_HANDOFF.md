# Vura implementation handoff

## Current hardening sequence

1. Payment integrity migration is prepared; do not apply to production until staged migration verification succeeds.
2. Inventory protection is next: variant/SKU stock, reservations, releases, sale movements, returns and concurrency/oversell protection.
3. Delivery/tracking follows: fulfillment records, split fulfillment, tracking events, courier fallback and dead-letter recovery.
4. Refund/RMA and supplier payout workflows follow.
5. Notifications become idempotent with retries/dead-letter handling.
6. RBAC, validation, rate limiting and security headers follow.
7. Finance reconciliation and exports follow.
8. End-to-end tests and deployment smoke tests are required before production verdict.

## Safety gates

- Never commit credentials or API tokens.
- Never claim a migration was applied without a database result.
- Never claim Vercel passed without a deployment result.
- Never treat a UI button as complete until it reaches an authorized backend mutation and persists correctly.
- Financial records must be idempotent and auditable.
- Inventory changes must be transactional and safe under concurrent checkout.
