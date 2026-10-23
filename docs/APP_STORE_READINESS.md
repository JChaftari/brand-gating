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

Data isolation: the function's input variables use the `$app:` namespace,
which Shopify resolves per app, so the two apps can't collide on that. The
`custom.*` metafields are per-store and the two apps won't share a store — but
see [finding F4](#f4--public-app-writes-to-the-merchants-custom-namespace).

---

## Status

Legend: ✅ done · 🟡 done in code, needs your action/verification · ❌ to do

| # | Requirement | Status | Notes |
|---|---|---|---|
| 1 | Compliance webhooks with HMAC (401 on invalid) | 🟡 | `functions/webhooks/compliance.js` built and tested locally (10/10 cases). Needs `brand-gating.pages.dev` building from `public-release` + the secret set, then a live test. |
| 2 | Compliance subscriptions in config | ✅ | `shopify.app.toml` `[[webhooks.subscriptions]]` (on `public-release`). |
| 3 | Install / auth | 🟡 | Managed installation (scopes in TOML) + session tokens via App Bridge Direct API Access — no OAuth code needed for the current feature set. Needs real URLs once the Pages project exists. |
| 4 | Only scopes the app uses | ✅ | Public app's config drops `read_files` (no image picker was built). |
| 5 | Protected Customer Data, Level 1, for the public app | ❌ | Partner Dashboard request + data-protection form. |
| 6 | Free-shipping template leftover in the function | ✅ | Fixed on `public-release` — see [F2](#f2--leftover-free-shipping-logic-in-the-function). |
| 7 | Works on a fresh install with no GraphiQL setup | ❌ | Verify — see [F3](#f3--fresh-installs-cant-run-graphiql-setup). |
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
`custom.brand_discounts` metafield) is the app's to delete. An earlier version
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

### F3 — Fresh installs can't run GraphiQL setup

On the custom store, metafield definitions were created by hand in GraphiQL
([SETUP.md §2](SETUP.md#2-one-time-metafield-definitions-graphiql)). A public
merchant won't do that. `metafieldsSet` accepts metafields without a
definition, so the Brands page, customer card, and function should all work on
a clean store (definitions mainly affect how the fields display in admin).
**Verify on a brand-new dev store with zero setup** before submitting. If
anything needs a definition, create it from the app on first load rather than
documenting a manual step.

### F4 — Public app writes to the merchant's `custom` namespace

`custom.brand_list` and `custom.brand_discounts` live in the merchant-owned
`custom` namespace. For one customer that's fine. For a public app it risks
colliding with a merchant's own fields of the same name. The conventional fix
is app-reserved `$app:` namespaces. Doing that without changing the custom app
means making the namespace a build-time setting (custom app keeps `custom`,
public app uses `$app:`). Not required by a published rule, but a robustness
issue worth deciding before public merchants have data in the old shape.

### F5 — Extension identity across two apps ✅

Resolved. Both apps were deployed from the same extension sources and each
release went to its own app (public `brand-gating-5`, app 350711742465;
customer `brand-gating-2`, app 439169679361), with no conflict.

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
4. **Prove the function is picked up, on a preview first.** Push only
   `public-release`. With `main` as the production branch, Cloudflare builds it
   as a preview at `public-release.brand-gating.pages.dev` and the live site is
   untouched. `POST /webhooks/compliance` there should return **401** (no
   secret in preview, no signature). 404/405 means the function wasn't found.
5. **Point `brand-gating.pages.dev` at the public code.** It belongs to the
   public app. In the project: Settings → Build → **Branch control** →
   production branch `public-release`. Settings → **Variables and Secrets** →
   Production → add `SHOPIFY_API_SECRET`, type **Secret**, value = the
   `brand-gating` (Public) app's Client secret from the Shopify Dev Dashboard.
   Then retry/trigger a production deployment.
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
6. ❌ **Make the webhook endpoint live** — action items 4–5. Until then
   Shopify has the subscriptions but `brand-gating.pages.dev` doesn't serve
   `/webhooks/compliance` yet, so any compliance webhook would fail. Then
   trigger test compliance webhooks and confirm 200s (and a 401 with a bad
   signature).
7. ❌ Fresh-store install test (F3); decide F4.
8. ❌ Ask Shopify Partner support about F1.
9. ❌ Request Protected Customer Data Level 1 for the public app.
10. ❌ Listing assets, privacy policy, pricing, support contact.
11. ❌ Demo store + reviewer instructions (include: add the customer-card
    block, create the automatic discount with the **Product** class).
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
