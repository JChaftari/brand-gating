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

## 2. Store data — nothing to set up

A store needs no manual setup. All app data lives in metafields in the
app-reserved namespace `$app:brand-discount` (only this app can write them; they can't
collide with a merchant's own `custom` fields), created on first use:

| Owner | Key | Created when |
|---|---|---|
| Shop | `brand_list` | the first brand is added on the Brands page |
| Discount | `input_variables` | **Turn on brand discounts** creates the discount; kept in sync after |
| Customer | `brand_discounts` | the first discount is assigned on the customer card |

No metafield definitions are required (verified on a fresh store).

Earlier versions used `custom.brand_list` / `custom.brand_discounts`, set up by
hand in GraphiQL. That data is ignored now: on a store set up that way,
re-enter brands and customer discounts through the app.

---

## 3. (Removed)

Seeding data by hand is no longer needed; use the Brands page and the
customer card.

---

## 4. Protected Customer Data (required for the customer card)

The customer card reads a customer metafield, which Shopify gates behind
Protected Customer Data access.

This is done in the **Partner Dashboard** (partners.shopify.com), not the Dev
Dashboard. The app's distribution method must be chosen first.

1. **Apps** → the app → sidebar **API access requests**.
2. **Protected customer data access** → **Request access**.
3. Select **Protected customer data** and give a reason (e.g. "Store each
   customer's brand discount percentages so they're applied at checkout and
   managed on the customer page"). **Save**.
4. Skip **protected customer fields** (name, email, phone, address): that's
   Level 2, which this app doesn't need. There is no per-metafield
   declaration; Level 1 covers customer metafields as a data type.
5. Complete the **Data protection details** (9 questions; the answers used
   are in [APP_STORE_READINESS.md](APP_STORE_READINESS.md#protected-customer-data--data-protection-answers)).

Development stores: works without review once saved. Public apps: reviewed
with the App Store submission. Custom-distribution apps: Shopify lists
Level 1 as "Always available"; if the card still says "not approved",
repeat these steps for that app.

Symptom if this is missing: the card shows *"This app is not approved to access
the Customer object."*

---

## 5. Discount that uses the function

The function only runs if an **automatic discount** using it exists. Create it
from the app: open **Apps → brand-gating**; while no such discount exists, the
Brands page shows a "Brand discounts are off" banner with a **Turn on brand
discounts** button. One click creates the discount (product lines only, starts
now, no end date, combines with order and shipping discounts) with the brand
list already loaded into it.

Don't try to create it from **Discounts → Create discount**: the function has
no discount-creation screen in Shopify admin, so choosing it in the
discount-type picker just opens the Brands page.

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

## 9. Billing (public app only)

The public app is paid: one plan, **$19.99/month with a 14-day free trial**,
through Shopify App Pricing ("managed pricing"). The customer's custom app is
never billed or gated (billing is keyed to the public app's client ID in
`web/src/api/billing.js` and `extensions/customer-brand-discounts/src/api.js`).

Set the plan up **before** deploying the plan check, or the app will lock
stores and send merchants to a plan page that doesn't exist yet:

1. Partner Dashboard → **App distribution** → the public app → **Distribution**
   → **Shopify App Store listing** → **Manage listing** → edit the listing →
   **Pricing content** → **Manage** → **Settings** → **Pricing method** →
   **Shopify App Pricing** → **Switch**.
2. Add a public plan ("Standard Plan"): $19.99 monthly or $199.99 yearly,
   14-day free trial. Set its welcome /
   redirect link to `/` so merchants land back on the Brands page.
3. If the plan editor offers it, make the plan free to test on development
   stores, so Shopify's reviewers (whose stores belong to another
   organization) can choose it. Stores in your own organization can always
   choose plans at no charge.

How the app enforces it (`web/src/components/BillingGate.jsx`): each time the
app opens it checks `currentAppInstallation.activeSubscriptions`. With no
`ACTIVE` plan it shows a **Choose a plan** screen (linking to Shopify's plan
page) and switches the store's brand discounts off; when a plan is active
again it switches back on only the discounts it switched off. With a plan,
the Brands page has a **Manage plan** button to the same Shopify page, so
merchants can switch between monthly and yearly in-app (App Store rule
1.2.3). The customer card is locked the same way. A merchant whose plan lapses but who never opens
the app keeps discounts at checkout until they do (accepted trade-off; see
[ARCHITECTURE.md](ARCHITECTURE.md#decision-billing-checked-when-the-app-opens)).

---

## Scope reference

`shopify.app.toml`:

```
scopes = "read_products,write_products,read_customers,write_customers,read_discounts,write_discounts"
[access.admin]
embedded_app_direct_api_access = true
```

See [ARCHITECTURE.md](ARCHITECTURE.md#scopes--data-access) for the per-scope
rationale.
