# Vura Design System

This document is the canonical product UI/UX direction for Vura. New screens and redesigns must follow it unless a deliberate product decision changes the system.

## Visual language

- Primary brand: vivid purple (`#5B2CFF`) with deeper purple for emphasis.
- Background: very light cool gray/lilac (`#F7F7FB`).
- Surfaces: white, rounded, spacious, subtle borders.
- Typography: DM Sans for interface text and Space Grotesk for display headings.
- Product imagery is the visual focus; avoid noisy decoration.
- Use generous whitespace, soft shadows and restrained glass effects.
- Buttons, inputs and cards use rounded corners with clear hierarchy.
- Desktop storefront uses a persistent left navigation, top search/actions, hero area, category rail and product grid.
- Mobile storefront uses a compact header, search, category strip, product cards and bottom navigation.
- Admin/Studio uses a dark analytical workspace with purple accents, metric cards, charts and a clear operations sidebar.

## Customer experience

The customer should see only retail information:

- Product name
- Product images
- Brand/specifications
- Vura retail price
- Availability
- Delivery information
- Vura payment instructions
- Order status

The customer must never see:

- Supplier purchase price
- Supplier phone/contact details
- Supplier identity unless explicitly intended as public information
- Expected margin
- Actual margin
- Internal sourcing notes
- Internal operating costs

## Vura Studio

Studio is a private admin workspace for operating the business:

- Overview
- Products
- Orders
- Sourcing
- Suppliers
- Customers
- Finance
- Reports
- Settings

Product capture should be camera-first and fast: photograph → identify → source price → retail price → category → publish.

## Security principles

1. Never trust client-supplied identity, role, price, supplier or profit fields.
2. Authentication uses server-side sessions with HttpOnly cookies; do not use localStorage for authorization.
3. Every admin endpoint verifies the authenticated server-side role.
4. Supplier economics are server-side/private fields and must be excluded from public product responses.
5. Order totals and payment state are calculated and verified server-side.
6. Bank-transfer payment instructions come from server-side configuration, not hard-coded secrets in the browser.
7. Never commit database credentials, API keys or private tokens.
8. Validate all input at API boundaries and enforce database constraints as a second line of defense.
9. Use parameterized SQL only.
10. Keep payment/order state transitions explicit and auditable.
11. Protect sensitive admin routes from IDOR by checking ownership/role on every request.
12. Use least privilege for database and deployment credentials.
13. Production changes should pass typecheck, lint, tests and build before deployment.
14. Security fixes take priority over visual polish when the two conflict.

## Vura payment model

Vura currently uses direct bank transfer.

- Account name: Vura Tech Hub
- Bank: VFD Microfinance Bank
- Account number: configured server-side in `platform_settings`

Do not reintroduce third-party payment initialization unless the business decision explicitly changes.
