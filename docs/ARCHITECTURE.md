# Architecture

Technical design of the brand-gating app: how the three surfaces fit together,
the data model, the invariants that keep them consistent, and the reasoning
behind the non-obvious decisions.

Audience: developers maintaining or extending this app. For merchant-facing
instructions, see the Merchant Guide. For setup/deployment, see
[SETUP.md](SETUP.md).

---

## System overview

The app gives every customer a per-brand discount percentage, applied
automatically at checkout. It has three surfaces and no custom backend — all
state lives in Shopify metafields.

```
┌──────────────────────────┐        ┌────────────────────────────┐
│  App Home — Brands page   │        │  Customer-detail card       │
│  web/ (Vite+React+Polaris)│        │  extensions/                │
│                           │        │  customer-brand-discounts/  │
│  Manage brand registry    │        │  (Preact + web components)  │
│  Add / Edit / Delete      │        │  Add / Edit / Remove a      │
│                           │        │  customer's discounts       │
└───────────┬───────────────┘        └──────────────┬─────────────┘
            │ writes                                 │ writes
            │                                        │
            ▼                                        ▼
   ┌─────────────────┐  ┌──────────────────────┐  ┌────────────────────────┐
   │ SHOP metafield   │  │ DISCOUNT metafield    │  │ CUSTOMER metafield      │
   │ custom.brand_list│  │ $app:brand-discount.  │  │ custom.brand_discounts  │
   │ (rich registry)  │  │ input_variables       │  │ ([{brand_tag, pct}])    │
   │                  │  │ ({brandTags:[...]})    │  │                        │
   └─────────────────┘  └───────────┬──────────┘  └───────────┬────────────┘
                                     │ read at checkout        │ read at checkout
                                     ▼                         ▼
                          ┌──────────────────────────────────────────┐
                          │  Shopify Function  extensions/brand-discount │
                          │  cart.lines.discounts.generate.run          │
                          │  Applies pct to each cart line whose product │
                          │  is tagged with a registered brand           │
                          └──────────────────────────────────────────┘
```

---

## Surfaces

### 1. Shopify Function — `extensions/brand-discount`

- JavaScript function, API version `2026-01`, compiled to WASM via Javy.
- Two targets: `cart.lines.discounts.generate.run` (the brand logic) and
  `cart.delivery-options.discounts.generate.run` (unrelated free-shipping
  logic, brand-agnostic, untouched by Phase 2).
- The cart-lines target reads:
  - `$brandTags` — the registered brand tags, sourced from the discount's
    `input_variables` metafield (see [Data model](#data-model)).
  - `cart.buyerIdentity.customer.metafield(custom.brand_discounts)` — the
    customer's per-brand percentages.
  - `product.hasTags(tags: $brandTags)` per cart line — which registered
    brands each line's product carries.
- For each line: find the brands it's tagged with, look up the customer's
  percentage for each, apply the highest. Emits one `productDiscountsAdd`
  candidate per eligible line with `selectionStrategy: All` so every eligible
  line is discounted simultaneously (bypassing Shopify's "best discount wins"
  default for automatic discounts).

### 2. App Home — Brands page — `web/`

- Vite + React 18 + Polaris 13. Runs in the embedded-app iframe.
- No server. Talks to the Admin GraphQL API directly from the browser via App
  Bridge Direct API Access (`fetch('shopify:admin/api/2026-01/graphql.json')`,
  auto-authenticated).
- Responsibilities: list/add/edit/delete brands; create and update the Shopify
  collection behind each brand; keep the registry metafields in sync.
  Brand collections are **automated** (rule: product tag equals the brand tag),
  so a collection always lists exactly the products the function discounts.
  Brands created before this change keep their original manual collections.
- Key modules:
  - `web/src/api/brandList.js` — the registry helper (`loadBrandList`,
    `syncBrandList`, `selfHealBrandRegistry`). **The only supported way to
    mutate the registry.**
  - `web/src/api/collection.js` — `createBrandCollection`, `updateCollection`.
  - `web/src/api/graphql.js` — `gql()` wrapper + `assertNoUserErrors`.
  - `web/src/hooks/useBrandList.js` — React state over the registry.

### 3. Customer-detail card — `extensions/customer-brand-discounts`

- **Preact** + Shopify admin web components (`<s-admin-block>`, `<s-table>`,
  `<s-select>`, `<s-number-field>`, `<s-button>`, …), not React. See
  [Decision: Preact, not React](#decision-preact-not-react-for-the-admin-card).
- Embedded block on the customer detail page
  (`admin.customer-details.block.render`).
- Reads the customer's `brand_discounts` + the shop's `brand_list` in one
  query; renders a table with inline Add / Edit / Remove.
- Writes the customer metafield via `metafieldsSet` (through `shopify.query()`,
  the extension-sandbox equivalent of Direct API Access).
- Key modules: `src/BlockExtension.jsx` (UI + flows), `src/api.js`
  (`loadCustomerBrandData`, `saveCustomerBrandDiscounts`).

---

## Data model

Three JSON metafields. No database.

| Owner | Namespace.key | Type | Shape | Written by | Read by |
|---|---|---|---|---|---|
| Shop | `custom.brand_list` | `json` | `[{tag, display_name, collection_id, image_url}]` | Brands page (`syncBrandList`) | Brands page, customer card |
| Discount | `$app:brand-discount.input_variables` | `json` | `{brandTags: [tag, …]}` | Brands page (`syncBrandList`) | Function (as `$brandTags`) |
| Customer | `custom.brand_discounts` | `json` | `[{brand_tag, percentage}]` | Customer card | Function, customer card |

Notes:

- **`brand_list`** is the human-facing source of truth. `display_name`,
  `collection_id`, `image_url` exist only for the admin UI; the function never
  reads them.
- **`input_variables`** is a *derived projection* of `brand_list` — just the
  flat tag list, in the shape Shopify Functions require for input variables
  (top-level keys matching GraphQL variable names). It lives on the **discount**
  because Shopify Functions only support function-owner metafields for input
  variables — not shop or app-install metafields. See
  [Decision: function input variables](#decision-function-input-variables-live-on-the-discount).
- **`brand_discounts`** keeps the Phase 1 shape unchanged — no migration was
  needed. The function's customer-side contract never changed across phases.

### The stale-brand case

A customer's `brand_discounts` can reference a `brand_tag` that's no longer in
`brand_list` (brand was deleted after assignment). This is expected and handled:

- The function only matches against `$brandTags`, so a stale entry simply never
  applies at checkout.
- The customer card flags stale rows visually and allows Remove but not Edit.

---

## Invariants

These are enforced in code. Don't bypass them.

### I1 — All registry mutations go through `syncBrandList()`

`web/src/api/brandList.js::syncBrandList()` writes the shop's `brand_list` **and**
every relevant discount's `input_variables` in a single `metafieldsSet` call.
`metafieldsSet` is atomic (Shopify changelog, 2023-01): if any metafield in the
batch fails, none persist. So the function-facing tag list can never drift from
the rich registry as the result of a partial write.

Adding a brand, editing one, deleting one — all build the full intended
`brand_list` and pass it to `syncBrandList`. There is no other write path to
these two metafields.

### I2 — The customer card always writes the full array

Add / Edit / Remove each construct the complete intended `brand_discounts`
array and send it via `metafieldsSet`. No delta writes, no read-modify-write
races within a single save.

### I3 — The function tolerates a missing/empty tag list

`cart_lines_discounts_generate_run.graphql` declares `$brandTags: [String!]`
(**nullable**) with `= []` default. If a discount lacks the `input_variables`
metafield (e.g. created via Shopify admin outside our UI), the function receives
null/empty and silently no-ops instead of erroring. See
[Decision: nullable input variable](#decision-nullable-brandtags).

### I4 — A customer can't hold two discounts on the same brand

The card's brand picker filters out already-assigned tags (stale ones included).
Enforced in the UI; the data shape doesn't prevent duplicates, so don't write
raw `brand_discounts` that bypasses the card.

---

## Self-healing

The app creates its own discount with `input_variables` already set (see
[Creating the discount](#creating-the-discount)). But a discount using our
function can also be created outside the app (e.g. through the Admin API), and
would start life with no `input_variables` metafield — the function would no-op
for it (I3) until we populate it.

`selfHealBrandRegistry()` runs on Brands-page mount:

1. Query every discount that uses the brand-discount function
   (`discountNodes` filtered by the function's ID).
2. For each, compare its `input_variables.brandTags` against the canonical
   `brand_list` tag set (order-independent).
3. If any is missing or drifted, trigger a full `syncBrandList()`.

There is no background sync — healing happens only when someone opens the Brands
page.

## Creating the discount

The function has no discount-creation UI in Shopify admin: choosing it in
**Discounts → Create discount** sends the merchant to the app's main page (the
Brands page). So the app creates the discount itself.

When the store has **zero** discounts using the function, the Brands page shows
a "Brand discounts are off" banner with a **Turn on brand discounts** button.
It calls `createBrandDiscount()` (`web/src/api/brandList.js`), which runs
`discountAutomaticAppCreate` with:

- `functionHandle: "brand-discount"`, `discountClasses: [PRODUCT]`
- `startsAt` now, no `endsAt`
- `combinesWith`: order ✅, shipping ✅, product ❌
- `metafields`: `$app:brand-discount.input_variables` = current tag list, so the
  discount never exists without its tag list (keeps invariant I1 in this one
  module)

Limitation: since Shopify has no edit screen for this discount type, merchants
can't change its combinations or dates from admin. A discount function settings
UI extension (plugs into Shopify's native discount form) would add that.

---

## Key decisions

### Decision: function input variables live on the discount

**Context.** The function needs the list of registered brand tags at checkout.
The natural home is the shop's `brand_list`, but the function schema exposes no
way to read an arbitrary shop metafield inside the cart-lines target, and
`product.hasTags(tags:)` requires the tag list as a static GraphQL argument —
so `$brandTags` must be an input variable.

**What we tried (Plan A).** Source `$brandTags` from a *shop* metafield via
`input_query_variables` in the extension TOML. The build/runtime rejected it:
Shopify Functions only support input-variable metafields on the **function
owner**, which for a Discount API function is the discount — not the shop, not
the app install. Confirmed against
<https://shopify.dev/api/functions/input-query-variables> ("metafields must be
set on the function owner itself—not on shops or app installations").

**What we shipped (Plan B).** A per-discount `$app:brand-discount.input_variables`
JSON metafield, configured via `[extensions.input.variables]` in the extension
TOML. `syncBrandList` writes it to every discount using the function, keeping it
derived from `brand_list`. The shop's `brand_list` remains the source of truth
for humans; the discount metafield is a machine projection.

**Consequence.** Sync must fan out across N discounts, and new discounts created
outside our UI need [self-healing](#self-healing).

### Decision: Preact, not React, for the admin card

**Context.** Admin UI extensions have a hard **64 KB compiled-bundle limit**
(enforced since API 2025-10).

**Finding.** React + `@shopify/ui-extensions-react` + `react-reconciler` bundles
to ~73 KB minimum — over the limit with no viable trim. This is acknowledged by
Shopify staff; the official path is Preact + web components.

**What we shipped.** The card uses `preact` + host-provided web components
(`<s-*>`), with `tsconfig.json` configuring the JSX transform
(`jsx: react-jsx`, `jsxImportSource: preact`). Bundle stays well under 64 KB.

**Consequence.** The card and the App Home use different component systems
(web components vs Polaris React). They look consistent because the `<s-*>`
components are Polaris-styled by the host, but the APIs differ (e.g.
`shopify.query()` vs `fetch('shopify:admin/...')`, `e.target.value` event
shapes, no Polaris imports).

### Decision: App Home is Vite + React + Direct API Access (no backend)

**Context.** The standalone Brands page can't be an admin UI extension (those
are embedded blocks/actions only). It needs to be App Home served from
`application_url`.

**What we shipped.** A backend-free Vite + React + Polaris SPA using App Bridge
Direct API Access for all Admin GraphQL calls. No session storage, no Prisma, no
database — every operation (metafield read/write, collection create/update) is
doable directly from the browser with the app's scopes.

**Why not the Remix template.** No need for webhooks, background jobs, billing,
or persistent server state in Phase 2. If Phase 3 requires those, migrating to
Remix is the expected path.

### Decision: nullable `$brandTags`

The input variable is declared `[String!]` (nullable), not `[String!]!`. A
non-null declaration causes Shopify to reject the whole input with
`InvalidVariableValueError` *before the function runs* when the metafield is
absent — which is exactly the new-discount-created-outside-our-UI case. Nullable
+ `= []` default + defensive JS lets the function no-op cleanly instead. The
`= []` default alone is insufficient because non-null variables don't fall back
to defaults on null.

### Decision: brand images via pasted URL, not a file picker

App Bridge's `resourcePicker` only supports product/variant/collection — there's
no file/media picker for admin surfaces yet
([open issue](https://github.com/Shopify/shopify-app-bridge/issues/266)). Rather
than take on the staged-upload + CORS complexity of a custom uploader, brand
images are added by pasting a Shopify Files CDN URL. Documented as a known
limitation; revisit if Shopify ships a picker.

### Decision: brand tag is immutable after creation

Changing a tag would orphan every product tagged with the old value and every
`brand_discounts` entry referencing it. The Edit form makes the tag read-only
and directs merchants to delete + recreate if they need a different tag.

---

## Scopes & data access

From `shopify.app.toml`:

```
read_products,write_products,read_customers,write_customers,read_discounts,write_discounts,read_files
embedded_app_direct_api_access = true
```

Rationale (per `metafieldsSet` docs — "same access level needed to mutate the
owner resource"):

- **products** → collection create/update (brands are backed by collections).
- **customers** → the customer `brand_discounts` metafield.
- **discounts** → `discountNodes` discovery + per-discount `input_variables`.
- **files** → reserved for a future image picker.
- Shop-owned `brand_list` needs no dedicated scope.

Reading customer data also requires **Protected Customer Data — Level 1**
configured per-app in the Partner Dashboard. We read no PII (no name, email,
phone, address), so Level 1 suffices. See [SETUP.md](SETUP.md).

---

## Where things are

```
extensions/
  brand-discount/                    Shopify Function (Phase 1 + refactor)
    src/cart_lines_discounts_generate_run.{graphql,js}
    shopify.extension.toml           [extensions.input.variables] block
  customer-brand-discounts/          Customer card (Preact)
    src/BlockExtension.jsx           UI + Add/Edit/Remove flows
    src/api.js                       load + save customer metafield
    tsconfig.json                    Preact JSX transform config
web/                                 App Home — Brands page
  src/api/brandList.js               registry helper (syncBrandList, self-heal)
  src/api/collection.js              collection create/update
  src/api/graphql.js                 gql() + assertNoUserErrors
  src/pages/BrandsPage.jsx           list + Add/Edit/Delete modals
  src/components/                     Add/Edit/Delete brand modals
  src/hooks/useBrandList.js
docs/                                this suite
```
