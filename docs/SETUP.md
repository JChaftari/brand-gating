# Setup & operations runbook

Everything needed to stand this app up on a fresh store and run it locally.
Assumes you have a Shopify Partner account and a dev (or Plus sandbox) store.

For the design behind these steps, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Prerequisites

- Node.js (LTS).
- Shopify CLI (`npm install -g @shopify/cli@latest`, or use `npm exec`).
- A Partner org + a development store.
- Access to the store's GraphiQL (Shopify Admin API) — the built-in GraphiQL
  app, or Partner-dashboard access to create an Admin API token.

---

## 1. Install

From the repo root:

```bash
npm install
```

This installs all workspaces (`extensions/*` and `web`). **Always install from
the root** — installing inside an individual extension folder rewrites the root
lockfile and drops sibling workspace deps (this bit us during development; a
clean root `npm install` fixes it).

---

## 2. One-time metafield definitions (GraphiQL)

Run these once per store, in the store's GraphiQL. They create the definitions
the three surfaces rely on. All are idempotent-ish: re-running a create returns
a `TAKEN` userError, which is harmless.

### 2a. Shop brand registry — `custom.brand_list`

```graphql
mutation {
  metafieldDefinitionCreate(definition: {
    name: "Brand List"
    namespace: "custom"
    key: "brand_list"
    description: "Registry of brands available for customer discount assignment."
    type: "json"
    ownerType: SHOP
    access: { admin: MERCHANT_READ_WRITE, storefront: NONE }
  }) {
    createdDefinition { id namespace key type { name } ownerType }
    userErrors { field message code }
  }
}
```

### 2b. Per-discount function input — `$app:brand-discount.input_variables`

```graphql
mutation {
  metafieldDefinitionCreate(definition: {
    name: "Brand-discount Function Input Variables"
    namespace: "$app:brand-discount"
    key: "input_variables"
    description: "JSON input variables for the brand-discount function. Top-level keys match GraphQL variable names (brandTags). Managed by the admin UI."
    type: "json"
    ownerType: DISCOUNT
    access: { admin: PRIVATE, storefront: NONE }
  }) {
    createdDefinition { id namespace key type { name } ownerType }
    userErrors { field message code }
  }
}
```

If `admin: PRIVATE` is rejected on your API version, use `MERCHANT_READ`.

### 2c. Customer discounts — `custom.brand_discounts`

This is the Phase 1 metafield. If Phase 1 was already deployed on the store it
exists already — skip. Otherwise:

```graphql
mutation {
  metafieldDefinitionCreate(definition: {
    name: "Brand Discounts"
    namespace: "custom"
    key: "brand_discounts"
    description: "Per-customer brand discount assignments: [{brand_tag, percentage}]."
    type: "json"
    ownerType: CUSTOMER
    access: { admin: MERCHANT_READ_WRITE, storefront: NONE }
  }) {
    createdDefinition { id namespace key type { name } ownerType }
    userErrors { field message code }
  }
}
```

---

## 3. Seed existing data (only if migrating a store with pre-existing brands)

If the store already had brands hardcoded in the function (pre-Phase-2), seed
the registry so the admin UI and function agree.

### 3a. Get the shop ID

```graphql
{ shop { id } }
```

### 3b. Seed `brand_list`

Look up each brand's collection ID (`collectionByHandle(handle: "brand-acme")`)
and write the registry:

```graphql
mutation {
  metafieldsSet(metafields: [{
    ownerId: "gid://shopify/Shop/<SHOP_ID>"
    namespace: "custom"
    key: "brand_list"
    type: "json"
    value: "[{\"tag\":\"brand-acme\",\"display_name\":\"Brand Acme\",\"collection_id\":\"gid://shopify/Collection/<ID>\",\"image_url\":null}]"
  }]) {
    metafields { id namespace key value }
    userErrors { field message }
  }
}
```

### 3c. Seed each discount's `input_variables`

Find the discount(s) using the function, then seed the flat tag list:

```graphql
# find them
query {
  discountNodes(first: 50) {
    nodes {
      id
      discount {
        __typename
        ... on DiscountAutomaticApp { title appDiscountType { functionId } }
      }
    }
  }
}
```

```graphql
# seed each
mutation {
  metafieldsSet(metafields: [{
    ownerId: "gid://shopify/DiscountAutomaticNode/<DISCOUNT_ID>"
    namespace: "$app:brand-discount"
    key: "input_variables"
    type: "json"
    value: "{\"brandTags\":[\"brand-acme\"]}"
  }]) {
    metafields { id namespace key value }
    userErrors { field message }
  }
}
```

After the initial seed, **never hand-edit these again** — the Brands page's
`syncBrandList` owns them, and its self-heal will re-derive `input_variables`
from `brand_list` on next page load.

---

## 4. Protected Customer Data (required for the customer card)

The customer card reads a customer metafield, which Shopify gates behind
Protected Customer Data access.

1. Partner Dashboard → your app → **API access** → **Protected customer data
   access** → **Request access**.
2. Choose **Level 1** (data excluding name/email/phone/address). We read no PII,
   so Level 1 is sufficient — do **not** request Level 2.
3. Provide a usage reason (e.g. "Display and manage per-customer brand discount
   assignments on the customer detail page").
4. Under customer **metafields**, declare `custom.brand_discounts`.
5. Save. On development stores this takes effect without review.

Symptom if this is missing: the card shows *"This app is not approved to access
the Customer object."*

---

## 5. Discount that uses the function

The function only runs if an **automatic discount** using it exists. In Shopify
admin: **Discounts → Create discount → Automatic discount →** select the
**Brand Discount** app function. Save.

If none exists, the Brands page shows a warning banner and brand updates won't
affect checkout.

---

## 6. Run locally

```bash
shopify app dev
```

Starts: the function build (Javy → WASM), the Vite dev server for the App Home,
and deploys the customer card to the dev store. Open the printed preview URL and
grant permissions on first run. If scopes changed, the CLI prompts to update the
app — accept.

Notes:
- The App Home dev server reads `PORT`/`HOST` from the CLI via env vars
  (`web/vite.config.js`); the `web/shopify.web.toml` dev command is plain
  `npm run dev` (no `{{port}}` placeholder — that isn't reliably substituted).
- Hard-reload (Ctrl/Cmd+Shift+R) admin pages after a rebuild to bust the cached
  extension bundle.

---

## 7. Deploy

```bash
shopify app deploy
```

Ships the function, the customer card, and app config. The App Home frontend is
served from `application_url` (`shopify.app.toml`) — deploy/host it wherever that
points (e.g. Cloudflare Pages).

---

## 8. Verify end-to-end

1. Register a brand on the Brands page → confirm a collection was created and
   `brand_list` updated.
2. Tag a product with the brand tag (Products → bulk edit).
3. On a customer, add a discount for that brand via the customer card.
4. Place a test order as that customer with the tagged product → the brand
   discount applies at checkout.
5. Check the function run logs (Partner Dashboard → your app → Extensions →
   brand-discount) show no `InvalidVariableValueError`.

---

## Scope reference

`shopify.app.toml`:

```
scopes = "read_products,write_products,read_customers,write_customers,read_discounts,write_discounts,read_files"
[access.admin]
embedded_app_direct_api_access = true
```

See [ARCHITECTURE.md](ARCHITECTURE.md#scopes--data-access) for the per-scope
rationale.
