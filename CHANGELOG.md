# Changelog

All notable changes to the brand-gating app. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Dates are release-to-store,
not tag dates.

## [Unreleased] — Public app (branch `public-release`)

Work toward App Store listing. The existing `brand-gating` app is Public
distribution and becomes the listing; the first customer gets a separate
custom-distribution app built from the code at tag `custom-v1.0.0`. Tracking
doc: `docs/APP_STORE_READINESS.md`.

### Added
- `shopify.app.toml` (the public app) subscribes to the mandatory compliance
  webhooks.
- `functions/webhooks/compliance.js` — Cloudflare Pages Function receiving
  `customers/data_request`, `customers/redact`, `shop/redact`; HMAC-verified,
  401 on invalid, stateless. Live at
  `brand-gating.pages.dev/webhooks/compliance` (Pages production branch is now
  `public-release`).
- `scripts/check-compliance-webhook.mjs` — sends signed sample webhooks to the
  live endpoint to verify it (expects 200s and a 401 control).

### Added (billing)
- Public app is billed through Shopify App Pricing: $19.99/month, 14-day free
  trial. `BillingGate` checks for an active plan when the app opens; without
  one it shows a **Choose a plan** screen, locks the customer card and
  switches brand discounts off, switching back on only those it paused once
  a plan is active. Keyed to the public app's client ID; the customer's
  custom app is never gated.

### Changed
- **All app data moved to the app-reserved namespace `$app:brand-discount`**
  (both apps): `brand_list` on the shop and `brand_discounts` on customers,
  alongside the existing `input_variables` on the discount. Merchant-owned
  `custom.*` fields could collide with a merchant's own fields or be rewritten
  by any app; app-reserved ones can only be written by this app. Done before
  either app had real merchant data, so nothing was migrated; old `custom.*`
  data on test stores is ignored.
- Public app requests no `read_files` scope (unused).
- A product now counts as part of a brand if it has the brand's tag **or** is
  in the brand's collection. Previously, adding products to a brand's
  collection by hand silently did nothing for discounts. The function checks
  `product.inCollections` against a new `$brandCollectionIds` input variable
  (index-aligned with `$brandTags`), and reads the discount's own
  `input_variables` to map each collection back to its brand. Existing
  discounts pick up the collection list the next time the Brands page opens
  (self-heal). Brand collections stay regular collections you add to by hand.
- Brands page shows "Brand discounts are on" when the store's brand discount
  exists, so merchants arriving from Discounts → Create discount see that
  it's already working.

### Fixed
- Merchants couldn't create the brand discount: the function has no
  discount-creation UI, and the Brands page banner pointed back to the
  discount picker. The banner now has a **Turn on brand discounts** button
  that creates it (`createBrandDiscount`, via `discountAutomaticAppCreate`).
- Removed leftover template logic in the function's delivery target that gave
  100% off shipping on every cart when the discount had the Shipping class
  enabled. The target now never discounts shipping.

## [Phase 2] — Brand registry & admin UIs

Added merchant-facing management of brands and per-customer discounts, and
refactored the function to source its brand list from data instead of hardcoded
tags — so adding a brand no longer requires a function redeploy.

### Added
- **Shop brand registry** — `custom.brand_list` metafield (json): the canonical
  list of brands (`tag`, `display_name`, `collection_id`, `image_url`).
- **Brands admin page** (App Home, `web/`): Vite + React + Polaris, no backend,
  App Bridge Direct API Access. Add / Edit / Delete brands; each brand creates
  and maintains a backing Shopify collection.
- **Customer-detail card** (`extensions/customer-brand-discounts/`): Preact +
  admin web components, embedded on the customer page. Add / Edit / Remove a
  customer's brand discounts inline; brand picker excludes already-assigned
  brands; stale-brand rows flagged.
- **`syncBrandList` helper**: atomic multi-metafield write keeping `brand_list`
  and every discount's `input_variables` consistent in one `metafieldsSet`.
- **Self-healing**: on Brands-page load, discounts created outside the app that
  lack `input_variables` are detected and re-synced.
- **Docs**: `README.md`, `docs/ARCHITECTURE.md`, `docs/SETUP.md`,
  `docs/TROUBLESHOOTING.md`, and a merchant guide.

### Changed
- **Function refactored** to read brand tags from the discount's
  `$app:brand-discount.input_variables` metafield (via
  `[extensions.input.variables]`) instead of hardcoded `hasAcme`/`hasBeta`/
  `hasGamma` aliases. Uses `product.hasTags(tags: $brandTags)`.
- **Input query** `$brandTags` declared nullable (`[String!]`, default `[]`) so
  a discount missing its metafield makes the function no-op rather than error.
- **App scopes** set to
  `read_products,write_products,read_customers,write_customers,read_discounts,write_discounts,read_files`
  + `embedded_app_direct_api_access`.

### Notes / decisions
- Function input variables must live on the **discount** (function owner), not
  the shop — Shopify Functions constraint. `brand_list` stays the human source
  of truth; the discount metafield is a derived projection.
- The customer card uses **Preact**, not React, to fit the 64 KB admin-extension
  bundle limit.
- Brand images are added by pasting a Shopify Files URL (no admin file picker
  exists yet).
- The customer metafield shape (`[{brand_tag, percentage}]`) was **unchanged**
  from Phase 1 — no data migration required.

### Known limitations
- No in-form file picker for brand images (paste URL).
- Enter key doesn't save inline edits on the customer card (use Save).
- The customer card block must be added **and pinned** once per store from
  the block manager; an unpinned block only previews and disappears.
- No "N customers affected" count on brand deletion (no efficient server-side
  query for metafield-JSON-contains).

## [Phase 1] — Per-customer brand discount function

### Added
- **Shopify Function** (`extensions/brand-discount`) applying per-customer,
  per-brand percentage discounts at checkout, reading the customer
  `custom.brand_discounts` metafield. Brand tags were hardcoded in the function
  at this stage.

---

## Deferred to Phase 3

Tracked here so they aren't lost:

- Bulk operations (assign a discount to many customers at once).
- Search / filter on the customer card's discount table.
- Audit log (who changed what, when).
- Staff role restrictions (currently any admin user can manage brands/discounts).
- Automated product tagging when a brand is created.
- Programmatic homepage-tile updates.
- Customer-impact count on brand deletion.
- In-form image upload (pending a Shopify admin file picker).
- Possible migration to the Remix app template if server-side state (webhooks,
  billing, scheduled sync) becomes necessary.
