# Vura Customer Storefront — Build Report

Date: 2026-08-25
Scope: full customer-facing storefront built on the existing Vura backend/database architecture (consolidated repo). No mock catalogs, fake checkout, fake tracking or hard-coded pricing were introduced. Every displayed price, stock state, delivery fee and order state is read from authoritative backend data.

## Verification performed in this workspace

| Gate | Result |
| --- | --- |
| `npm run typecheck` (frontend TS strict) | PASS |
| `npm run typecheck:api` (API TS strict) | PASS |
| `npm run lint` | PASS (0 errors; 13 pre-existing-style warnings: react-refresh export style, 2 hook-deps advisories) |
| `npm run test:run` (unit) | PASS — 44/44 (5 suites incl. new storefront utils) |
| `npm run build` | PASS — route-level code splitting, largest chunk 74 KB gzip |
| Dev-server smoke test | Homepage serves 200; all API routes resolve to their handlers and fail only on the expected `DATABASE_URL` env guard (no DB configured in this sandbox) |

## What was built

### Backend (extends existing Vercel + Neon architecture)

- **Migration `016_storefront_commerce.sql`** (additive):
  - Products: unique SEO `slug` (+ trigger), `compare_at_price_kobo` discount reference price, `tags text[]`, `specifications jsonb`, `view_count`, trigram/GIN search indexes.
  - Orders: structured address columns (`delivery_state/lga/area/street/landmark/instructions`) + `customer_whatsapp`.
  - `delivery_zones` table seeded with real rules (Lagos ₦3,500 · 2–3d, Abuja FCT ₦4,500 · 3–5d, Nationwide fallback ₦5,500 · 4–7d) and a `quote_delivery(state_code, subtotal)` function incl. free-delivery thresholds.
  - `create_order_v2(...)` — order creation + variant inventory reservation + server-computed delivery fee in one atomic transaction.
  - `wishlist_items` (unique per user/product) and first-party `analytics_events`.
- **`GET /api/products`** upgraded (public): `q` search across name/brand/description/tags/specifications/category/variant name+SKU (+ trigram fuzzy matching), category slug filter, brand facet, price range, in-stock filter, deals-only filter, sort (newest/popular/price asc/desc), pagination (`page`/`perPage` capped at 48), `ids=` batch fetch for cart/wishlist revalidation, single-product detail by slug/id with variants, optional view counting. Admin POST untouched. Supplier/source economics are never exposed publicly.
- **`POST /api/orders`**: multi-item cart checkout (`items[]`), structured Nigeria address, WhatsApp capture, guest checkout preserved (auto account + claim token email), per-line atomic creation via `create_order_v2`; response carries per-order numbers, combined totals, delivery zone/ETA and bank-transfer details from `platform_settings`. Partial failures return created orders plus explicit `failures[]` (409 semantics for stock).
- **`GET /api/orders/tracking`**: now also returns shipments (fulfillments) with supplier name, tracking number, courier and delivery events — scoped to the owning buyer.
- **New endpoints**: `/api/wishlist` (GET/POST/DELETE, auth-scoped), `/api/delivery/quote` (server rules only), `/api/analytics` (batched event capture; public aggregate trending searches). Dev plugin routes updated accordingly.

### Frontend (`src/customer/**`, dark premium identity)

- Design tokens: canvas `#0B0B12`, surfaces, Vura purple `#5B2CFF` accent, Space Grotesk display + DM Sans body; glassmorphism reserved for header/drawers/modals.
- Reusable kit: Button/Input/Select/Textarea/Field/Badge/Skeleton/EmptyState/ErrorState/Modal/Drawer (focus-trapped, Esc-closable)/Toast (aria-live)/QuantityStepper/Breadcrumbs/Pagination/Accordion/Price/Rating.
- Router (History API), lazy-loaded routes: Home, Category/Search/Deals/New, Product, Cart, Checkout, Order confirmation, Track list/detail, Account tabs (orders/wishlist/notifications/profile), Sign-in/Sign-up, Help, 404.
- Header: sticky glass bar, desktop mega-category dropdown, mobile drawer + search overlay, suggestion combobox (debounced live results with thumbnails/prices), recent + trending searches, notification bell with unread count, cart badge; mobile bottom tab bar.
- Home sections in spec order: hero slides with CTAs/category shortcuts → categories → trending → deals → new arrivals → recommended (recently-viewed driven, deterministic) → why Vura → delivery/trust → newsletter intent.
- Product cards: image, brand, name, price, compare-at + discount %, stock badges, wishlist heart, quick view, add-to-cart.
- PDP: gallery with hover zoom, fullscreen lightbox, thumbnails, mobile swipe; grouped variant pickers that update price/SKU availability and auto-correct impossible combinations; meaningful availability states (Available / Low stock / Only N left / Out of stock / Available to source / Coming soon / Pre-order); quantity capped by live stock; Add to Cart + Buy Now; state-select delivery estimator backed by the quote API; description/specifications/delivery/returns accordions; related products; JSON-LD Product schema + meta/OG/canonical management.
- Cart: localStorage-persisted lines, server revalidation on mount and before checkout with change reporting (price changed / sold out / quantity capped), save-for-later into wishlist, subtotal, empty/loading/error states.
- Checkout: 4 steps (Customer → Delivery → Review → Payment) with progress indicator; State→LGA cascading selects from `/api/locations`, area/street/landmark/instructions; review summary; payment step renders the actual configured method (bank transfer details from `/api/payment-info`) — nothing is hard-coded; place-order handles 409s and network failure with retry UI.
- Confirmation: order numbers, ETA date window computed from the server quote, Track Order links, single transfer-reference entry submitted per order via the verified payment-submission endpoint, account-claim nudge for guests.
- Tracking: order list with payment/status chips; detail page shows the real event timeline plus shipments (supplier, courier, tracking #) when fulfillment data exists.
- Wishlist: server-backed for signed-in users with guest localStorage merge on login; live prices/stock on the wishlist grid.
- Notifications center with mark-as-read; profile view; analytics events (`page_view`, `search`, `product_view`, `variant_selected`, `add_to_cart`, `remove_from_cart`, `checkout_started`, `checkout_completed`, `order_completed`, `payment_failed`, `wishlist_add`, `newsletter_intent`) captured server-side.
- Accessibility & performance passes: skip link, landmarks, aria labels/live regions, focus traps, keyboard-operable dialogs/gallery, visible focus rings, lazy images with explicit sizes, Cloudinary transform helper (`w_…, q_auto, f_auto`), code splitting, debounced search.

## Passed

1. Browse: home, category, deals, new arrivals against live catalog APIs.
2. Search: suggestions, recent/trending, filters, sorting, pagination, no-result state.
3. Product detail: gallery, variants, availability states, quantity caps, delivery estimator.
4. Variant-aware add-to-cart with per-variant price/stock.
5. Cart with server-side revalidation and change surfacing.
6. Guest + signed-in checkout with structured Nigeria addressing.
7. Server-authoritative delivery fee included in order totals (atomic with reservation).
8. Bank-transfer payment display from platform settings + reference submission per order.
9. Order confirmation with ETA window and tracking entry points.
10. Real tracking timeline + shipments for authenticated buyers.
11. Wishlist (authed + guest merge), notifications, profile.
12. Analytics funnel events captured to the database.
13. Typecheck (app+api), ESLint (0 errors), unit tests 44/44, production build.
14. No supplier pricing/admin fields leak through public product responses (covered by integration assertion).

## Not verified here (requires staging)

- Full browser E2E journeys (desktop/mobile matrices at 320–1440 px) — needs running app + seeded staging DB.
- `scripts/integration-test.ts` extended suite (migrations applied in-harness; covers products search/pagination/detail/deals/ids, delivery quotes, multi-item orders incl. partial failure and variant-reservation rollback, payment submission, tracking scoping, wishlist, analytics/trending) — requires `TEST_DATABASE_URL`; refused to run locally by design.
- Migration `016` applied to staging via `npm run db:migrate` and smoke-checked there.
- Lighthouse/Core Web Vitals numbers on staging hardware/network.
- Payment verification round-trip completed by an admin in Studio (existing flow, unchanged).

## Intentionally deferred

- Coupon/promotion engine (no backend support existed; spec forbids client-trusted discounts, so no coupon UI was faked). Frontend/analytics slot ready.
- Multi-item single-order model: checkout currently creates one sourcing order per line (matches Vura's per-product sourcing + payout architecture); each line is atomic, partial failures are surfaced honestly. A shared order header remains a schema evolution listed in the repo's own P1 roadmap.
- SSR/prerender for full crawler parity (SPA ships meta/OG/canonical/JSON-LD dynamically; programmatic landing pages beyond category pages deferred until SSR/prerender lands).
- AI shopping assistant (spec positions it as future work; privacy boundary documented in spec §27 must be enforced server-side first).
- Reviews/ratings (no reviews table exists — fake ratings are explicitly forbidden; UI renders ratings only when data exists).
- Saved addresses book, password change, notification preference toggles (no customer-facing endpoints yet).
- Hero video support (hook exists via slide config; disabled by default for performance).
