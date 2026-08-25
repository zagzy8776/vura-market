# Next production gates

This hardening branch must not be merged to main until the following are verified in the real environment:

- `npm run lint`
- `npm run typecheck`
- `npm run typecheck:api`
- `npm run test:run`
- `npm run build`
- migration review and staging application
- customer checkout/payment smoke test
- admin order mutation smoke test
- duplicate payment/notification tests
- Vercel deployment smoke test

GitHub changes in this branch are implementation work, not evidence that those runtime gates have passed.
