# Vura Community Sellers — Launch Guide

This feature adds a self-service posting workflow **separate from Vura Studio and Vura-managed checkout**.

## User journey
- Top-right Post button: `/sell/new` → sign in or register using the existing customer login.
- A seller can submit multiple products with 1–8 Cloudinary images, title, description, category, price, quantity, location and WhatsApp contact.
- `/sell`: the seller's own listings, edit, pause, resubmit, remove, and public share links. Listings are paginated (24/page), with a daily cap of 40 new posts to limit abuse.
- `/marketplace`: approved community listings with search and state filter.
- `/shop/:sellerId`: public shop with approved listings.
- `/listing/:id`: product detail and WhatsApp contact.

## Privilege boundary
Users remain `customer` accounts. No new role grants admin privileges. All seller reads and mutations require an authenticated user, and product operations are scoped to the server-derived `seller_id`. The administrator reviews listings at `/studio?tab=seller-listings`; the API requires `products.read` or `products.write` permission. Publishing is never automatic. Paused or rejected posts cannot appear publicly.

Community listings are not appended to Vura's existing `products` table or represented as available for Vura-managed checkout. Transactions with community sellers take place directly; avoid claiming Vura protects these payments. No commission or revenue is automatically booked.

## Required deployment work
1. Apply `db/migrations/034_marketplace_sellers.sql` to the production Neon DB using the standard migration runner (`npm run db:migrate`) **after staging verification**. This migration is not applied just by merging code.
2. Confirm `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET` are configured for browser image uploads with suitable upload restrictions.
3. Check routing through `/api/seller`, `/api/marketplace`, and `/api/admin/seller-listings`.
4. Run `npm run typecheck`, `npm run typecheck:api`, `npm run lint`, `npm run test:run`, and `npm run build`.
5. Smoke test: register customer → Post → see Pending in My Shop → admin approves → listing appears → share & WhatsApp → seller edits → re-enters review → other seller's edit returns 404 → ordinary user cannot access Studio.
6. Configure anti-abuse reporting, dispute procedures, and expanded seller verification before nationwide promotion.

## Intentional limits in this phase
- Direct contact only: no automated Vura escrow, vendor payout, ratings or commission.
- Sellers may list as many products over time as they like; rate limiting guards against mass-spam.
- A shop profile is shared across the owner's listings. Editing shop contact/location in the form changes that profile.
