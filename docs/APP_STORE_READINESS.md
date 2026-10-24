# Shopify App Store readiness

What it takes to list brand-gating publicly on the Shopify App Store **while
the existing custom-distribution app keeps serving the first customer
unchanged**. Status, decisions, open questions, and the remaining checklist.

See also: [ARCHITECTURE.md](ARCHITECTURE.md) · [SETUP.md](SETUP.md) ·
[TROUBLESHOOTING.md](TROUBLESHOOTING.md).

---

## Strategy: two apps, one codebase

A Shopify app's distribution method (custom vs public) is chosen once and is
permanent, and a public app can only be installed on development stores until
it passes review. So one app can't serve the first customer now *and* become
the public listing later. We run two apps from the same code.

The existing `brand-gating` app was already set to **Public** distribution
(listing in Draft), so it becomes the App Store app, and the customer gets a
new custom-distribution app:

| | Customer app | Public app |
|---|---|---|
| Purpose | First customer, now | App Store listing |
| Partner Dashboard | **new** app — **Custom** distribution, tied to the customer's store | existing `brand-gating` (client `f9f32…`) — **Public**, listing in Draft |
| CLI config | `shopify.app.custom.toml` (client `4fa17f…`, on `main`) | `shopify.app.toml` |
| Frontend host | new Cloudflare Pages site, built from `main` | `brand-gating.pages.dev`, built from `public-release` |
| Code | `main` (first release tagged **`custom-v1.0.0`**; customer fixes land on `main`) | branch **`public-release`** |
| Compliance webhooks | not subscribed | subscribed → `/webhooks/compliance` |

Each app needs its own copy of the frontend site because the build bakes in
that app's Client ID (`%SHOPIFY_API_KEY%` in `web/index.html`).

Pick the target per command, e.g. `shopify app deploy --config custom`, or
switch the default with `shopify app config use <file>`.

**Rule for shared code:** anything changed on `public-release` must either be
inert for the custom app (new files, public-only config) or be a deliberate,
tested change before it's ever deployed to the custom app. The customer's
build is always reproducible from `custom-v1.0.0`.

Data isolation: all app data lives in the app-reserved `$app:brand-discount` namespace,
which Shopify resolves per app, so the two apps can't collide even on the
same store, and neither can collide with a merchant's own fields (F4).

---

## Status

Legend: ✅ done · 🟡 done in code, needs your action/verification · ❌ to do

| # | Requirement | Status | Notes |
|---|---|---|---|
| 1 | Compliance webhooks with HMAC (401 on invalid) | ✅ | Live at `https://brand-gating.pages.dev/webhooks/compliance`. Verified in production with `scripts/check-compliance-webhook.mjs`: all three topics 200 when correctly signed, 401 when mis-signed or unsigned. |
| 2 | Compliance subscriptions in config | ✅ | `shopify.app.toml` `[[webhooks.subscriptions]]` (on `public-release`). |
| 3 | Install / auth | 🟡 | Managed installation (scopes in TOML) + session tokens via App Bridge Direct API Access — no OAuth code needed for the current feature set. Needs real URLs once the Pages project exists. |
| 4 | Only scopes the app uses | ✅ | Public app's config drops `read_files` (no image picker was built). |
| 4b | Billing via Shopify App Pricing ($19.99/mo, 14-day trial) | 🟡 | Plan check + discount pause/resume built and tested against a simulated API. Needs the plan set up in the Partner Dashboard ([SETUP §9](SETUP.md#9-billing-public-app-only)), then deploy + live test. |
| 5 | Protected Customer Data, Level 1, for the public app | 🟡 | Request + Data protection details in the Partner Dashboard; answers [below](#protected-customer-data--data-protection-answers). Reviewed with the submission. Answers 2, 4 and 8 rely on the privacy policy (row 8). |
| 6 | Free-shipping template leftover in the function | ✅ | Fixed on `public-release` — see [F2](#f2--leftover-free-shipping-logic-in-the-function). |
| 7 | Works on a fresh install with no GraphiQL setup | ✅ | Verified end to end on `brand-gating-fresh` — see [F3](#f3--fresh-installs-cant-run-graphiql-setup). |
| 8 | Listing assets (icon, screenshots, copy, pricing, privacy policy, support) | ❌ | Non-code. |
| 9 | Demo store + reviewer instructions | ❌ | Non-code. |
| 10 | Storefront performance (≤10-pt Lighthouse drop) | 🟡 | No storefront scripts; logic runs in a checkout Function. Run Lighthouse and keep the report. |
| 11 | API versions not deprecating within 90 days | ✅ | Function `2026-01`, webhooks `2026-07` — re-check at submission time. |
| 12 | Session tokens, no third-party cookies / localStorage | ✅ | Already true. |

---

## Decision: additive backend, not a Remix migration

An earlier version of this doc recommended migrating to the Shopify Remix
template. With the requirement that the custom app not be compromised, that's
the wrong trade: Remix rewrites the App Home and forks the codebase.

Instead, the only server-side piece the public app needs — the compliance
webhook receiver — is a single **stateless Cloudflare Pages Function** at
`functions/webhooks/compliance.js`:

- Reads the raw body, verifies `X-Shopify-Hmac-Sha256` with
  `crypto.subtle.verify` (constant-time) using the public app's client secret.
- Invalid/missing HMAC, unconfigured secret, or malformed header → **401**.
- Valid → **200**. No database, no Admin API calls, no token storage.
- Inert for the custom app: it never subscribes, and without
  `SHOPIFY_API_SECRET` on its Pages project every request is rejected.
- Doesn't touch the Vite build (`dist/` is unchanged).

Revisit Remix only if later features need real server state (billing,
background jobs, scheduled sync, stored offline tokens).

---

## Findings and open questions

### F1 — Does acknowledging `customers/redact` with a 200 suffice?

The app holds no data outside Shopify, so the handler acknowledges every valid
request and does nothing else. Shopify's docs require a 200 and completion
within 30 days "regardless of whether the app collects personal data," but
don't state whether data the app wrote **into Shopify** (the customer's
`$app:brand-discount.brand_discounts` metafield) is the app's to delete. An earlier version
of this doc claimed it was; that was not confirmed and has been withdrawn.

- **Current:** stateless acknowledge (sufficient if Shopify's own redaction
  covers customer metafields).
- **If review says otherwise:** the handler must clear the metafield, which
  requires an offline Admin API token per shop → token exchange on install +
  storage (e.g. Cloudflare KV) → and `shop/redact` must then purge that
  storage. Ask Shopify Partner support before submission to avoid a rejection
  loop.

### F2 — Leftover free-shipping logic in the function

`extensions/brand-discount/src/cart_delivery_options_discounts_generate_run.js`
is unmodified template code: if the automatic discount has the **Shipping**
class enabled, it gives **100% off shipping on every cart**. The custom app is
safe only because its discount was created with the Product class. A public
merchant (or a reviewer) ticking Shipping would hand out free shipping
storewide.

**Fixed on `public-release`:** the delivery target now always returns no
operations (kept registered rather than removed, to avoid changing the
function's targets). Verified by compiling the function and running it with
the Shipping class enabled → no discount, while a brand-tagged cart line still
gets its percentage. The test fixture that encoded the old behavior as
"expected" was rewritten.

The same fix is on `main` (customer app), verified the same way. Function
code is identical on both branches.

### F3 — Fresh installs can't run GraphiQL setup ✅

Verified. On a brand-new dev store (`brand-gating-fresh`) with no GraphiQL
setup and no metafield definitions, the full flow works: Brands page, adding a
brand, turning on brand discounts, the customer card, and a discounted
checkout — by tag and by collection membership. Metafields work without
definitions; the only visible difference is that the customer page's built-in
Metafields card doesn't list "Brand Discounts" (that listing came from the
hand-made definition).

The test found two real problems, both fixed: no way to create the discount
(F6), and adding a product to a brand's collection didn't count (the function
now accepts tag **or** collection).

Testing note: installing via `shopify app dev` leaves a dev preview on the
store even after stopping the command; run `shopify app dev clean --store …`
before testing the released version.

### F4 — Public app writes to the merchant's `custom` namespace ✅

Resolved: both apps now keep all data in the app-reserved `$app:brand-discount`
namespace (`brand_list` on the shop, `brand_discounts` on customers,
`input_variables` on the discount). Done before either app had real merchant
data, so nothing was migrated; old `custom.*` data on the test stores is
ignored. Verified end to end on `brand-gating-fresh` (public `brand-gating-7`):
new brand, product added to its collection, customer card, discounted
checkout. Optional follow-up: declare the definitions in `shopify.app.toml`
so merchants can see the data read-only in admin. See
[ARCHITECTURE.md](ARCHITECTURE.md#decision-app-reserved-metafield-namespace).

### F6 — Merchants had no way to create the discount

Found by the fresh-store test (F3). The function has no discount-creation UI,
so choosing it in **Discounts → Create discount** opens the app's Brands page —
whose banner then pointed merchants back to the discount picker, a loop. The
original store's discount had been created by hand in GraphiQL during Phase 1,
which hid this.

**Fixed on `public-release`:** the banner now has a **Turn on brand discounts**
button that creates the discount via `discountAutomaticAppCreate` (product
lines only, starts now, combines with order + shipping discounts) with its tag
list included in the same call. Needs verifying on the fresh store, then
porting to `main` for the customer.

Remaining gap: merchants can't edit that discount's combinations or dates from
admin. A discount function settings UI extension would add that if review asks
for it. See [ARCHITECTURE.md](ARCHITECTURE.md#creating-the-discount).

### F5 — Extension identity across two apps ✅

Resolved. Both apps were deployed from the same extension sources and each
release went to its own app (public `brand-gating-5`, app 350711742465;
customer `brand-gating-2`, app 439169679361), with no conflict.

---

## Protected Customer Data — data protection answers

Answers given in the Partner Dashboard's **Data protection details** (Level 1).
Keep the privacy policy consistent with them.

| # | Question | Answer | Why |
|---|---|---|---|
| 1 | Minimum personal data? | Yes | Only per-customer brand discount percentages, linked to the customer ID. No name, email, phone or address (Level 1 only). |
| 2 | Tell merchants what data and why? | Yes | Privacy policy + merchant guide. Requires the privacy policy to be published. |
| 3 | Limit use to that purpose? | Yes | Used only to apply and manage discounts. No analytics, marketing or sharing. |
| 4 | Privacy / data protection agreements with merchants? | Yes | Shopify counts a privacy policy as this agreement. Requires it to be published. |
| 5 | Respect customers' consent decisions? | Not applicable | No tracking or marketing; nothing consent-based is processed. |
| 6 | Respect opt-outs of data sale? | Not applicable | Data is never sold or shared. |
| 7 | Opt-out of automated decisions with legal/significant effects? | Not applicable | The merchant sets each percentage; the app only applies it. A discount has no legal or significant effect. |
| 8 | Retention periods? | Yes | Data exists only in the merchant's store while the merchant keeps the assignment; removed when they remove it or delete the customer. The app keeps no copies; compliance webhook payloads are acknowledged and not stored or logged (only topic + shop domain are logged). Stated in the privacy policy. |
| 9 | Encrypt at rest and in transit? | Yes | All data is stored by Shopify (encrypted at rest by Shopify); all traffic is HTTPS (Shopify APIs, the Cloudflare-hosted page and webhook endpoint). The app has no storage of its own. |

There is no per-metafield declaration in the request; field selection only
covers name/email/phone/address (Level 2, not used).

---

## Your action items

These need your accounts; nothing in the repo can do them.

1. ✅ **Check the existing app's distribution.** Done — `brand-gating` is
   Public (listing in Draft). It stays the public app.
2. ✅ **Create the customer's app.** Done — new `brand-gating` app (client
   `4fa17f…`), Custom distribution, config `shopify.app.custom.toml` on `main`.
   **Still to do at go-live:** enter the customer's `*.myshopify.com` domain on
   its distribution page, and request Protected Customer Data Level 1 for it.

For testing the customer app before its site exists,
`shopify app dev --config custom` (from `main`) serves the page through a
temporary tunnel.

3. ✅ **How `brand-gating.pages.dev` deploys.** It's a Cloudflare Pages
   project named `brand-gating` in account `ad2529655cd54eb6ca47142be437265e`,
   connected to GitHub `JChaftari/brand-gating` (the "Cloudflare Workers and
   Pages" GitHub app). Every push builds automatically. Current settings:

   | Setting | Value |
   |---|---|
   | Production branch | `main` |
   | Root directory | `/` (repo root) |
   | Build command | `npm install --workspaces && npm run build --workspace=web` |
   | Build output directory | `/web/dist` |

   Because the root directory is the repo root, Pages Functions are read from
   **`functions/`** at the repo root (not `web/functions/`). Don't change the
   root directory.
4. ✅ **Prove the function is picked up, on a preview first.** Pushed
   `public-release`; Cloudflare built it as a preview at
   `public-release.brand-gating.pages.dev` with the live site untouched.
   `POST /webhooks/compliance` there returns **401 "Unauthorized"** for
   unsigned, forged and malformed signatures (the function's own response).
   The live site still returns 405 for the same request.
5. ✅ **Point `brand-gating.pages.dev` at the public code.** Done: production
   branch is now `public-release`, and `SHOPIFY_API_SECRET` (the Public app's
   Client secret, encrypted) is set for Production. To reach these settings,
   open the project's **Settings** page (from a deployment page, use the
   "this project's Settings" link) — **Build → Branch control** and
   **Variables and Secrets** are sections on that page.

   Re-verify any time from the repo root:
   `node scripts/check-compliance-webhook.mjs` (prompts for the secret,
   hidden). Expect 3× 200 and 1× 401.
6. **Create the customer's copy of the site** (only when the customer is ready).
   A second Pages project from the same GitHub repo with the same build
   command, output directory and root directory, production branch `main`,
   and variable `SHOPIFY_API_KEY` = the customer app's Client ID
   (`4fa17f…`). Put its URL in `shopify.app.custom.toml` as `application_url`
   and in `redirect_urls`.

---

## Remaining roadmap

1. ✅ Freeze custom release (`custom-v1.0.0`), branch `public-release`.
2. ✅ Compliance webhook function + public app config.
3. ✅ Customer app created (action items 1–2).
4. ✅ F2 (free shipping) fixed on both branches.
5. ✅ Both apps deployed: public `brand-gating-5` (compliance webhooks now
   registered with Shopify), customer `brand-gating-2`.
6. ✅ Webhook endpoint live in production and verified (200 signed, 401
   forged/unsigned).
7. ✅ Fresh-store install test (F3) passed; F6 and collection membership fixed
   along the way (public app `brand-gating-6`).
7b. ✅ Ported to the customer app (`main`, deployed as customer `brand-gating-3`):
   the "Turn on brand discounts" button, the "on" status line, and
   tag-or-collection membership. App code (`extensions/`, `web/src`) is now
   identical on both branches. (The Acme/Beta/Gamma data is on
   `brand-gating-test`, which runs the public app; the customer app has no
   installs yet, so no existing collections changed behavior.) Merchant guide
   updated and committed as `docs/Brand-Discounts-Merchant-Guide.docx`.
7c. ✅ F4 decided and done: both apps use `$app:brand-discount` for all data.
8. ❌ Ask Shopify Partner support about F1.
9. ❌ Request Protected Customer Data Level 1 for the public app.
10. ❌ Listing assets, privacy policy, pricing, support contact.
11. ❌ Demo store + reviewer instructions (include: add **and pin** the
    customer-card block, and click **Turn on brand discounts** on the Brands page).
12. ❌ Lighthouse run, keep the report.
13. ❌ Submit; expect iteration.

---

## References

- [App requirements checklist](https://shopify.dev/docs/apps/launch/app-requirements-checklist)
- [Privacy law compliance](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance)
- [App configuration (multiple config files)](https://shopify.dev/docs/apps/build/cli-for-apps/app-configuration)
- [App installation & managed installation](https://shopify.dev/docs/apps/build/authentication-authorization/app-installation)
- [Protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data)
- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/)
