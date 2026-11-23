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

The public app has two public plans through Shopify App Pricing ("managed
pricing"):

- **Free** — $0, up to **2 brands** get discounts at checkout.
- **`premium-plan`** — $19.99/month or $199.99/year with a 14-day free trial,
  no brand limit.

The customer's custom app is never billed or gated (billing is keyed to the
public app's client ID in `web/src/api/billing.js` and
`extensions/customer-brand-discounts/src/api.js`).

### Free plan (added 23 November 2026)

**Status:** created and live on 23 November 2026: invoice name `Free`,
handle `free`, redirect `/`, no charge; listing display name `Free` with
features "Up to 2 brands", "Per-customer discount on each brand", "Applied
automatically at checkout". The App Store listing shows "Free plan
available" (no review was needed). Verified on `brand-gating-fresh`:
selecting Free shows the 2-brand banner, the "No discounts on free plan"
badges and **Upgrade for more brands**.

Shopify App Pricing creates a $0 subscription when a merchant picks a free
plan, so the store has an `ACTIVE` subscription either way. The app tells the
plans apart **by name**: a subscription whose name contains the word "free"
(case-insensitive, for example `Free` or `free-plan`) is the free plan; any
other active plan, including `premium-plan` and Shopify's `shopify-test`,
has no limit. **Keep the word "free" in the free plan's name and keep it out
of every paid plan's name.**

To add it: Partner Dashboard → **App distribution** → the public app →
**Distribution** → **Manage listing** → **Edit** (English) → **Pricing
content** → **Manage** → under **Public plans** click **Add**. Billing:
**Free**. Name it **Free**. Features: "Up to 2 brands", "Per-customer
discounts for each brand", "Applied automatically at checkout". Welcome link
`/`. Save, then check on a development store (open the app → **Manage plan**
→ pick Free): the Brands page shows "Free plan: N of 2 brands used".

What the limit does (`setBrandLimit` in `web/src/api/brandList.js`):
only the **first 2 brands** in the registry go into the discount's
`input_variables`, so only they get discounts at checkout. The registry
(`brand_list`) keeps every brand, so upgrading restores them all on the next
Brands page load (self-heal sees the plan change as drift), and downgrading
trims them the same way. The Brands page swaps **Add brand** for **Upgrade
for more brands** at the limit and labels any brand beyond it; the customer
card offers only the covered brands and labels assigned ones that aren't
covered. Like the plan check itself, a plan change takes effect at checkout
when the app is next opened.

Current setup (done 16 November 2026): **Shopify App Pricing is enabled**;
`premium-plan` is the one public plan and is marked **free for partner and
development stores**. A `shopify-test` private plan ($0/month) also exists;
Shopify created it, and only stores assigned to it can see it.

Setting it up — finish **all** of it before deploying the plan check or
submitting for review:

1. Partner Dashboard → **App distribution** → the public app → **Distribution**
   → **Shopify App Store listing** → **Manage listing** → edit the listing →
   **Pricing content** → **Manage**.
2. Under **Update to App Pricing**, click **Get started**. Shopify drafts App
   Pricing plans; set the plan to $19.99 monthly / $199.99 yearly, 14-day
   free trial, welcome / redirect link `/` (merchants land back on the Brands
   page), and resolve anything marked **Action needed**.
3. In the plan's settings, tick the option that makes it **free for partner
   and development stores**. Without it, development stores outside your
   Partner organization (Shopify's reviewers) can only subscribe by approving
   the real charge.
4. Test on a development store in your own organization: open the app →
   **Choose a plan** / **Manage plan** → select the plan → approve.
5. Tick **I've verified my app is ready to switch to Shopify App Pricing** and
   click **Enable Shopify App Pricing**. The progress bar must show **App
   Pricing enabled**.

**Why step 5 matters:** until App Pricing is enabled the plans are drafts.
Development stores in your own organization can still select drafts ("Free to
test"), so everything looks fine on your own store, but every other store,
reviewers' included, sees **"No plans are available for your store."** That
paused the first App Store submission (rule 1.2.1, November 2026).

How the app enforces it (`web/src/components/BillingGate.jsx`): each time the
app opens it checks `currentAppInstallation.activeSubscriptions`. With no
`ACTIVE` plan it shows a **Choose a plan** screen (linking to Shopify's plan
page) and switches the store's brand discounts off; when a plan is active
again it switches back on only the discounts it switched off. With a plan,
the Brands page has a **Manage plan** button to the same Shopify page, so
merchants can switch between monthly and yearly in-app (App Store rule
1.2.3). The customer card is locked the same way. A merchant whose plan
lapses but who never opens the app keeps discounts at checkout until they do
(accepted trade-off; see
[ARCHITECTURE.md](ARCHITECTURE.md#decision-billing-checked-when-the-app-opens)).

---

## 10. IP allowlist (public app only)

Shopify requires every public app to have an IP allowlist from
**20 November 2026**; apps without one are flagged to merchants, delisted and
blocked from new installs. The allowlist rejects Admin API requests made with
the app's access token from anywhere outside the list.

Current setting (Dev Dashboard → the public app → **Settings** → **IP
allowlist**): **Networks (ASN) → AS13335** (Cloudflare, where the Pages
Functions run), no country limit, **Enforcement on**.

Why it changes nothing today: the app makes **no server-side Admin API
calls**. The Brands page and the customer card reach Shopify through App
Bridge Direct API access from the merchant's browser, which the allowlist
exempts; the discount function runs inside Shopify; the Pages Functions
(compliance webhooks, `/api/session`) never call the Admin API. The
allowlist's **Run test** over the previous 30 days (which included full
testing on `brand-gating-fresh`) found *no Admin API requests at all*, and the
app worked normally with enforcement on.

If a feature ever adds server-side Admin API calls: keep them on Cloudflare
(covered by AS13335) or add the new host's addresses **before** deploying it,
then re-run the test. A static IP list would be narrower than an ASN if the
app ever gets fixed outbound addresses.

The customer's custom app is not affected (the requirement is for public
apps only).

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
