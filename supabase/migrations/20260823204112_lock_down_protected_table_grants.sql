/*
# Lock down protected table grants

1. Purpose
- Removes default anonymous Data API privileges from private account data.

2. Changes
- `profiles`: anonymous users can no longer read or write profile records.
- `wallets`: anonymous users can no longer read or write wallet records.
- `transactions`: anonymous users can no longer read or write transaction records.

3. Security
- Signed-in access remains controlled by the existing owner policies.
- The public `service_catalog` remains readable to anonymous and signed-in visitors.

4. Important note
- This migration changes privileges only; it does not remove columns, rows, or user data.
*/

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.profiles FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.wallets FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.transactions FROM anon;
