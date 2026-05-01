# brand-gating

A Shopify app that applies per-customer, per-brand percentage discounts at
checkout. Each customer can have a different discount percentage on each
registered brand. The merchant manages the brand registry and the per-customer
discount assignments through embedded admin UIs — no JSON editing required.

---

## How it works

Three surfaces, one source of truth:

1. **Shopify Function** (`extensions/brand-discount`) — runs at checkout, reads
   the customer's brand-discount metafield and the active discount's
   brand-tag list, and applies the right percentage to each cart line whose
   product is tagged with a registered brand.

2. **App Home — Brands page** (`web/`) — Vite + React + Polaris. Lets the
   merchant register, edit, and delete brands. Each brand creates a Shopify
   collection automatically and registers the brand tag in two synced
   metafields (one rich shop-level metafield for the admin UI, one flat
   per-discount metafield consumed by the function).

3. **Customer-detail card** (`extensions/customer-brand-discounts`) — Preact +
   Shopify web components, embedded on the customer detail page. Lets the
   merchant add, edit, and remove a customer's brand discounts inline.

Data lives in three metafields, all in the `custom` (or app-reserved)
namespace:

| Owner | Key | Type | Purpose |
|---|---|---|---|
| Shop | `custom.brand_list` | `json` | Rich brand registry — `[{tag, display_name, collection_id, image_url}]`. Source of truth for the admin UI. |
| Discount | `$app:brand-discount.input_variables` | `json` | Per-discount input variables for the function — `{brandTags: [...]}`. Function reads this via `[extensions.input.variables]` in the toml. Synced from `brand_list` automatically. |
| Customer | `custom.brand_discounts` | `json` | Per-customer discount assignments — `[{brand_tag, percentage}]`. Edited via the customer-detail card. |

The `syncBrandList` helper in `web/src/api/brandList.js` is the **only**
supported way to mutate the registry. It writes the shop metafield + every
relevant discount's input metafield in a single atomic `metafieldsSet` call.

---

## For merchants

### Register a brand

1. Open **Apps → brand-gating → Brands** in Shopify admin.
2. Click **Add brand**.
3. Enter a **Display name** (e.g., `Brand Acme`). The **Brand tag** is
   auto-generated as a lowercase hyphenated slug (e.g., `brand-acme`); you
   can edit it before saving.
4. Optionally paste a **Brand image URL** — see [Adding a brand
   image](#adding-a-brand-image) below.
5. Click **Add brand**. A new Shopify collection is created with the brand's
   display name and handle. The brand appears in the registry.

After registering, you must complete two manual follow-up steps for the
brand to actually start receiving discounts at checkout:

- **Tag your products** with the brand tag (e.g., `brand-acme`) via Products
  → bulk edit. Only tagged products will receive the discount.
- **Add the brand to your homepage tiles** in the theme editor (if your theme
  uses brand tiles).

### Adding a brand image

Shopify hasn't shipped an embedded file picker for admin UI extensions yet
([open issue](https://github.com/Shopify/shopify-app-bridge/issues/266)), so
brand images use a two-step flow:

1. Upload the image via **Shopify admin → Content → Files**.
2. Click the uploaded image, copy its CDN URL.
3. Paste the URL into the **Brand image URL** field on the Add or Edit form.

The URL is stored on the brand and used as the collection's featured image
plus on homepage tiles.

### Edit a brand

1. On the Brands page, click **Edit** on the brand's row.
2. Change the **Display name** or **Brand image URL**. Both updates propagate
   to the underlying collection (title and featured image).
3. The **Brand tag** is read-only after creation. Changing a tag would orphan
   every product currently tagged with the old value and every customer
   metafield that references it. To use a different tag, delete and re-create
   the brand.

### Delete a brand

1. On the Brands page, click **Delete** on the brand's row.
2. Confirm.

Deletion only removes the brand from the registry. **It does NOT delete the
underlying collection or untag any products.** If you want those gone, do it
manually via Products → Collections and Products → Bulk edit. Customers who
had this brand assigned will stop receiving the discount at checkout.

### Assign discounts to a customer

1. Open any customer in **Shopify admin → Customers**.
2. The first time you visit a customer page, click **Add block** in the
   **Blocks** section and add the **Customer Brand Discounts** block. (Once
   added, it appears on every customer page automatically.)
3. In the **Brand Discounts** card:
   - Click **+ Add brand discount** → pick a brand from the dropdown, enter a
     percentage (0–100), click **Save**.
   - Click **Edit** on a row → change the percentage → **Save**.
   - Click **Remove** on a row → confirm.
4. Changes take effect at the customer's next checkout.

The brand picker only shows brands the customer doesn't already have
assigned. A customer can't have two discounts on the same brand.

### Stale brand warnings

If a brand is deleted from the registry while customers still have it in
their `brand_discounts` metafield, those rows on the customer card render
with a red warning ("no longer registered"). The discount won't apply at
checkout — the function only matches against currently-registered brands.

You can clean up stale rows by clicking **Remove**. The Edit button is hidden
for stale rows since editing the percentage would have no effect.

### How discounts apply at checkout

For every product in the customer's cart:

1. The function checks whether the product is tagged with any registered
   brand.
2. If yes, it looks up the customer's `brand_discounts` JSON for that brand
   tag.
3. If a percentage exists, it applies as a per-line discount.

Products tagged with multiple brands get the highest matching percentage from
the customer's list. Products tagged with a brand the customer doesn't have
assigned receive no brand discount.

The function honors Shopify's discount stacking rules — the brand discount
shows up alongside any other automatic or code-based discounts the customer
qualifies for.

---

## For developers

### Stack

- **Function**: JavaScript Shopify Function, API version `2026-01`. Compiled
  to WASM via Shopify's Javy. See `extensions/brand-discount`.
- **App Home**: Vite + React 18 + Polaris 13, no backend. Uses App Bridge
  Direct API Access (`fetch('shopify:admin/api/2026-01/graphql.json')`) for
  all reads and writes. See `web/`.
- **Customer card**: Preact + Shopify admin web components (`<s-admin-block>`,
  `<s-table>`, etc.). React + `@shopify/ui-extensions-react` cannot be used
  here because the bundle exceeds Shopify's 64 KB limit; see the file header
  in `extensions/customer-brand-discounts/src/BlockExtension.jsx` for the full
  rationale and links.
- **State**: Zero custom backend. All state lives in Shopify metafields. See
  the table in [How it works](#how-it-works).

### One-time setup (per dev store)

These were done in this project's dev store via GraphiQL. If setting up
fresh, run them once in the merchant's GraphiQL admin:

1. Create the shop `custom.brand_list` metafield definition (json type, owner
   SHOP, admin read/write).
2. Create the per-discount `$app:brand-discount.input_variables` metafield
   definition (json type, owner DISCOUNT, admin private).
3. Seed `brand_list` with any pre-existing brands the merchant already had.
4. Seed `input_variables` on each existing discount that uses the
   brand-discount function.

The exact GraphiQL mutations are documented in the project's git history
(commits during Phase 2 setup). Future seed ops should go through the admin
UI, not GraphiQL.

### Required app scopes

Configured in `shopify.app.toml`:

```
read_products, write_products      → collectionCreate / collectionUpdate
read_customers, write_customers    → customer.brand_discounts metafield
read_discounts, write_discounts    → discountNodes query + per-discount metafield writes
read_files                         → reserved for future ResourcePicker
```

Plus `embedded_app_direct_api_access = true` so the App Home can call the
Admin GraphQL API from the browser.

Customer data also requires **Protected Customer Data Level 1** access
configured per-app in the Partner Dashboard. We don't read PII (no name,
email, phone, address), so Level 1 is sufficient.

### Architecture invariants

These are enforced in code; do not bypass:

1. **All brand-registry mutations go through `syncBrandList()`** in
   `web/src/api/brandList.js`. It atomically writes the shop's `brand_list`
   AND every relevant discount's `input_variables` in one `metafieldsSet`.
   `metafieldsSet` is documented as atomic (Shopify changelog 2023-01) so
   partial writes are impossible.

2. **The customer card never bypasses the customer metafield write helper**
   in `extensions/customer-brand-discounts/src/api.js`. The full intended
   array is sent on every save (Add / Edit / Remove); there are no delta
   writes.

3. **The function reads `$brandTags` as nullable (`[String!]`)** in
   `extensions/brand-discount/src/cart_lines_discounts_generate_run.graphql`.
   If the metafield is missing or empty, the function silently no-ops rather
   than crashing. Self-healing in `selfHealBrandRegistry()` repopulates the
   metafield on next Brands-page load.

### Self-healing flow

When the merchant opens the Brands page:

1. `selfHealBrandRegistry()` queries every discount that uses the
   brand-discount function.
2. For each, it reads `input_variables` and compares against the canonical
   `brand_list`.
3. If any discount's tag list is missing or out of sync, it triggers a full
   `syncBrandList()`.

This handles two cases:
- Merchant created a new automatic discount via Shopify admin (outside our
  UI) → it lacks the metafield → we populate it.
- Merchant edited the registry on a different machine and the cached state
  drifts → we re-sync.

The check runs only on Brands-page mount. There's no background sync.

### Running locally

```bash
# from the project root
npm install
shopify app dev
```

This starts the function build, the Vite dev server for the App Home, and
deploys the customer card extension to the dev store. Open the dev preview
URL to grant permissions on first run.

---

## Known limitations

- **No file picker for brand images.** Merchants must paste a Shopify Files
  CDN URL. Will switch to a built-in picker if/when Shopify ships one for
  admin UI extensions.
- **Enter key doesn't save in the customer card's inline edit.** The save
  button works fine; only the Enter shortcut is missing. Likely a quirk of
  `<s-number-field>`'s key event surface in Shopify's web components. Low
  priority.
- **Customer-card block must be added per-page on first visit.** Shopify's
  block manager UX, not something we control. Once added, it persists for all
  customer pages.
- **No customer-impact count on brand delete.** The spec called for "N
  customers will lose this discount" on the delete confirmation; skipped
  because Shopify has no efficient server-side filter for
  metafield-JSON-contains-string queries — would require iterating the entire
  customer list.

## Deferred to Phase 3

- Bulk operations (assign discounts to many customers at once).
- Search / filter on the customer card's discount table.
- Audit log of who changed what when.
- Staff role restrictions (any user with admin access can currently use
  these UIs).
- Automated product tagging when a brand is created.
- Programmatic homepage tile updates.
- Customer-impact count on brand deletion.

---

## Developer resources

- [Shopify Functions](https://shopify.dev/docs/apps/build/functions)
- [Function input query variables](https://shopify.dev/api/functions/input-query-variables)
- [Admin UI extensions (Preact + web components)](https://shopify.dev/docs/api/admin-extensions)
- [App Bridge Direct API Access](https://shopify.dev/docs/api/app-bridge-library)
- [Polaris React](https://polaris.shopify.com)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
