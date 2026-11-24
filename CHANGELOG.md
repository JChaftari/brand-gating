# Changelog

All notable changes to the brand-gating app. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Dates are release-to-store,
not tag dates.

## 2026-11-24 — Setup guide and customer-tag tiers (public app)

Released as public `vendtier-wholesale-by-brand-12`. Verified live on
`brand-gating-fresh`: created a `gold-dealer` tier (Northridge Boards 25%,
Powder & Pine 15%), tagged a customer with no own discounts on those brands;
the customer card listed both under "From customer tags", and an admin
draft order gave The Complete Snowboard $699.95 → $524.97 and Selling Plans
Ski Wax $24.95 → $21.21. Test tier, tag and draft removed afterwards. The
setup guide wasn't shown there because that store has finished every step.

### Added
- **Discounts by customer tag (Premium).** A tier gives every customer
  with a Shopify customer tag the same per-brand percentages, e.g. everyone
  tagged `gold-dealer` gets 25% on Brand A and 15% on Brand B. Managed in a
  new "Discounts by customer tag" card on the Brands page (add, edit,
  delete; percentages per registered brand). Rules at checkout: a
  customer's own discount for a brand overrides the tier for that brand;
  several tiers → the best percentage per brand; tag match ignores case.
  Data: shop metafield `$app:brand-discount.tiers`
  (`[{tag, discounts:[{brand_tag, percentage}]}]`), copied into every
  discount's `input_variables` as `tierTags` + `tiers` by the same atomic
  `metafieldsSet` writes as the brand list (`syncTiers`; `syncBrandList`
  and self-heal carry them too). The function asks `customer.hasTags` for
  `$tierTags`. Free plan: tiers stay saved but aren't sent to checkout (the
  card shows an upgrade button); limited to the brands the plan covers.
  The customer card shows "From customer tags" discounts, marking any its
  own rows replace. Tests: 14 function unit tests, the tier fixture run on
  the built wasm, 23 simulated Admin API checks (free/premium switch, drift,
  validation); queries validated against API 2026-10. Card bundle 27.1 KB.
- Setup guide on the Brands page: "Set up Vendtier, about 5 minutes", with
  four steps ticked off as the store completes them: turn on brand
  discounts, add a brand, add products to a brand (any brand's collection
  has products or a product carries its tag), give a customer their brand
  discounts. The next step is expanded with its button. It disappears when
  all four are done, or for good when the merchant clicks Hide (shop flag
  `$app:brand-discount.setup_guide_hidden`). While it shows, it replaces the
  "Brand discounts are off" banner.
- The customer card records step 4 when it saves a customer's first brand
  discount (shop flag `$app:brand-discount.customer_discounts_set`, written
  in the same `metafieldsSet`). An order that used the brand discount also
  counts. Tested against a simulated Admin API (12 checks); query validated
  against API 2026-10. Customer card bundle 25.6 KB.

### Changed
- App Store listing: the paid plan's card is now "Premium" with features
  (unlimited brands, per-customer discount on each brand, applied
  automatically at checkout), matching the Free card.

## [Unreleased] — Free plan (public app)

### Added
- Free plan for up to 2 brands (Shopify App Pricing, alongside
  `premium-plan`). A store is on it when its active subscription's name
  contains "free". Only the first 2 registered brands go into the discount's
  `input_variables`; the registry keeps every brand, so upgrading restores
  them on the next Brands page load and downgrading trims them the same way.
  Brands page: "Free plan: N of 2 brands used", **Upgrade for more brands**
  in place of **Add brand** at the limit, and a label on brands beyond it.
  Customer card: offers only covered brands and labels assigned ones that
  aren't. The customer's custom app is unaffected (not billed). Tested
  against a simulated Admin API (20 checks: plan detection, cap at checkout,
  upgrade, downgrade, delete). Customer card bundle 25.4 KB (limit 64 KB).
  Needs the Free plan created in the Partner Dashboard (SETUP §9).

## 2026-11-19 — API 2026-10 and review request (both apps)

Released as public `vendtier-wholesale-by-brand-10` (published on the App
Store: <https://apps.shopify.com/vendtier-wholesale-by-brand>) and customer
`brand-gating-6`.

### Changed
- Shopify API `2026-01` → `2026-10` for the discount function, the customer
  card (`@shopify/ui-extensions` 2026.10.2) and the Brands page's Admin API
  calls (2026-01 stops being served around 16 January 2027). No behavior
  change: queries validated, function outputs identical, tested on a dev
  preview and after release. Webhooks stay on `2026-07`.

### Added
- App Store review request on the Brands page (App Bridge Reviews API):
  public app only, once brand discounts have been applied to at least one
  order, at most once per 60 days from our side (Shopify enforces its own
  limits too). Not in the customer card (rule 2.2.6).

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
- Public app is billed through Shopify App Pricing: `premium-plan`,
  $19.99/month or $199.99/year, 14-day free trial. `BillingGate` checks for an
  active plan when the app opens; without one it shows a **Choose a plan**
  screen, locks the customer card and switches brand discounts off, switching
  back on only those it paused once a plan is active. Keyed to the public
  app's client ID; the customer's custom app is never gated.
- **Manage plan** button on the Brands page (opens Shopify's plan page) so
  merchants can change plans in-app; hidden in the customer's app.

### Added (App Store review)
- `functions/api/session.js` + `web/src/api/session.js`: on load the app gets
  an App Bridge session token and `GET /api/session` verifies it (signature,
  audience, expiry, shop). Turns Shopify's "Using session tokens" embedded app
  check green; reported only, never blocks the app.
- Privacy policy at `brand-gating.pages.dev/privacy` (`web/public/privacy.html`).
- IP allowlist enforced for the public app (Dev Dashboard setting, not code):
  Cloudflare AS13335. See `docs/SETUP.md` §10.

### Changed (App Store review)
- Merchant-facing text: brands without an image show a placeholder instead
  of a broken image; the post-add banner gives a general theme-editor tip
  instead of the first customer's "homepage tiles" step; the image help text
  no longer comments on Shopify's file picker.
- These, the session check and Manage plan are also on `main` (customer app
  `brand-gating-5`); they reach the customer once their app has its own
  Cloudflare site.

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
