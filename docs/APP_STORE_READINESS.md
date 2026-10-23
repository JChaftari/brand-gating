# Shopify App Store readiness

An honest audit of what it takes to move brand-gating from a **custom app**
(installed on named stores via the Partner Dashboard) to a **public app**
listed on the Shopify App Store, plus a concrete remediation plan.

> **Current verdict: not publishable as-is.** The app is backend-free
> (`web/shopify.web.toml` → `roles = ["frontend"]`, served as a static SPA).
> Several mandatory App Store requirements need a server endpoint that does not
> exist today. None of this affects custom-app distribution, which this app
> already satisfies.

See also: [ARCHITECTURE.md](ARCHITECTURE.md) · [SETUP.md](SETUP.md) ·
[TROUBLESHOOTING.md](TROUBLESHOOTING.md).

---

## Custom app vs public app — decide first

| | Custom app (today) | Public app (App Store) |
|---|---|---|
| Distribution | Partner Dashboard → custom distribution to named stores | Public listing, any merchant installs |
| Review | None | Full Shopify app review |
| Compliance (GDPR) webhooks | Not required | **Required** |
| OAuth / install flow | Managed install is enough | Real install + auth required |
| Protected Customer Data | Configure on the store | Approved for the public app |
| Listing assets | None | Icon, screenshots, pricing, privacy policy, support |
| Backend server | Not needed | **Needed** (at minimum for compliance webhooks) |

If you only need this for one or a handful of specific merchants, **stop here —
you're already done.** Everything below is exclusively for public listing.

---

## Requirements matrix

Legend: ✅ meets · ⚠️ partial / needs verification · ❌ blocker (missing)

| # | Requirement | Status | Notes |
|---|---|---|---|
| 1 | Mandatory compliance webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) with HMAC verification | ❌ | No `[[webhooks.subscriptions]]` in TOML; no endpoint exists. Hard blocker. |
| 2 | Real install / auth (managed install + token exchange) | ❌ | `[auth].redirect_urls` is the scaffold placeholder. |
| 3 | Protected Customer Data approval for the public app | ❌ | App reads `customer.brand_discounts`. Needs Level 1 grant + attestations for distribution. |
| 4 | Privacy policy URL | ❌ | Listing asset — none yet. |
| 5 | Pricing declared (Billing API or "free") | ❌ | Listing asset — none yet. App is currently free/no billing. |
| 6 | App icon, screenshots, listing copy, support contact | ❌ | Listing assets — none yet. |
| 7 | Reviewer test instructions / demo store | ❌ | Required for review. |
| 8 | Session-token auth, no third-party cookies/localStorage | ✅ | App Bridge + Direct API Access already compliant. |
| 9 | Embedded via App Bridge with correct redirect | ⚠️ | App Bridge is loaded; auth redirect must be finalized (see #2). |
| 10 | Storefront performance (no >10-pt Lighthouse drop) | ✅* | No storefront script injection; logic is in a checkout Function. Verify before submit. |
| 11 | API version not deprecating within 90 days | ✅ | Function `2026-01`, webhooks `2026-07`. |
| 12 | Minimal, justified scopes; no prohibited scopes | ✅ | See `shopify.app.toml`. |
| 13 | TLS/HTTPS on all endpoints | ✅ | Pages host is HTTPS; new backend must be too. |
| 14 | App uninstall handled (`app/uninstalled`) | ⚠️ | Recommended; pairs naturally with the new backend. |

\* Likely-pass but must be demonstrated with an actual Lighthouse run during
review prep.

---

## Blocker 1 — Compliance (GDPR) webhooks

**Rule.** Per Shopify: *"Any app that you distribute through the Shopify App
Store must respond to data subject requests, regardless of whether the app
collects personal data."* Three topics are mandatory for every app. On an
**invalid** HMAC the endpoint must return **401**; on success, a **200**-series
code. The action must complete within 30 days.

**Why it hits us specifically.** The app stores customer data in the
`custom.brand_discounts` customer metafield. `customers/redact` must delete it.

### 1a. Declare the webhooks in `shopify.app.toml`

```toml
[webhooks]
api_version = "2026-07"

  [[webhooks.subscriptions]]
  compliance_topics = [
    "customers/data_request",
    "customers/redact",
    "shop/redact",
  ]
  uri = "https://<your-backend-host>/webhooks/compliance"
```

The `uri` must point at a real HTTPS endpoint (the new backend — see
[The backend decision](#the-backend-decision)).

### 1b. Implement the endpoint (illustrative)

Minimal handler. Verifies HMAC first (401 on failure), then acts per topic.
This sketch is framework-agnostic pseudocode-ish Node; adapt to whatever host
you choose.

```js
import crypto from 'node:crypto';

// Raw body is required for HMAC — do NOT parse JSON before verifying.
function verifyHmac(rawBody, hmacHeader, apiSecret) {
  const digest = crypto
    .createHmac('sha256', apiSecret)
    .update(rawBody, 'utf8')
    .digest('base64');
  // timing-safe compare
  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeader || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function handleComplianceWebhook(req, res) {
  const rawBody = await readRawBody(req); // string
  const hmac = req.headers['x-shopify-hmac-sha256'];

  if (!verifyHmac(rawBody, hmac, process.env.SHOPIFY_API_SECRET)) {
    return res.status(401).send('Invalid HMAC'); // REQUIRED on bad HMAC
  }

  const topic = req.headers['x-shopify-topic'];
  const payload = JSON.parse(rawBody);

  switch (topic) {
    case 'customers/data_request':
      // All customer data lives in Shopify metafields — we hold no external
      // copy. Nothing to assemble; acknowledge. (If you ever cache data,
      // return it to the merchant here within 30 days.)
      break;

    case 'customers/redact':
      // Delete the customer's brand_discounts metafield.
      await deleteCustomerBrandDiscounts(payload.shop_domain, payload.customer.id);
      break;

    case 'shop/redact':
      // 48h after uninstall. We store nothing outside Shopify, so no-op.
      // If a backend DB is added later, purge this shop's rows here.
      break;
  }

  return res.status(200).send('ok');
}
```

`deleteCustomerBrandDiscounts` would call `metafieldsDelete` (or set the value
empty) via an Admin API token obtained through token exchange — see Blocker 2.

**Key point:** because all app state lives in Shopify metafields, the *logic*
is tiny (mostly acknowledgements + one metafield delete). The cost is that the
webhooks require a **server that can receive POSTs and verify HMAC** — which a
static SPA cannot do.

---

## Blocker 2 — Install / authentication

**Today.** `[auth].redirect_urls` is still
`https://shopify.dev/apps/default-app-home/api/auth` (scaffold placeholder).

**Modern minimum.** You don't need a full legacy OAuth backend. Use:

- **Shopify managed installation** — scopes are declared in `shopify.app.toml`
  (already done) and Shopify installs/updates them without calling your app.
- **Token exchange** — the embedded frontend exchanges its App Bridge session
  token for an Admin API access token when a server-side Admin API call is
  needed (e.g. inside the compliance webhook handler, or any server logic).

For the **frontend**, Direct API Access already covers the admin UI's own
calls, so the interactive app stays largely as-is. What's new is:

- A correct auth redirect / embedded entry configured for the public app.
- Token exchange wherever the **backend** must call the Admin API (the
  `customers/redact` metafield delete is the concrete case).

**Net:** the addition of a backend for Blocker 1 is what makes token exchange
relevant. They're one workstream.

---

## Blocker 3 — Protected Customer Data (for distribution)

Configured per-store today (Level 1 on the dev store — see
[SETUP.md §4](SETUP.md#4-protected-customer-data-required-for-the-customer-card)).
For **public** distribution this becomes a reviewed grant on the app itself,
with data-handling attestations:

- Request **Level 1** only (no name/email/phone/address — we read none).
- Declare the specific field: `custom.brand_discounts`.
- Complete the data-protection questionnaire (retention, encryption, access
  controls, subprocessors). Since we hold no data outside Shopify, most answers
  are "data remains in Shopify; no external storage" — but the attestation must
  still be completed.

---

## Listing requirements (non-code, all mandatory)

These aren't in the repo and must be produced for the listing:

- [ ] **App icon** (per Shopify's size/format spec).
- [ ] **Screenshots** of the Brands page and the customer card.
- [ ] **Listing copy** — name, tagline, description, feature bullets, category.
- [ ] **Pricing** — declare free, or wire the Billing API. App is free today.
- [ ] **Privacy policy URL** — must describe the customer-data handling.
- [ ] **Support contact** — email and/or support URL.
- [ ] **Demo store + reviewer instructions** — a store pre-seeded with brands,
      a tagged product, a customer with discounts, and an active automatic
      discount using the function, so a reviewer can verify end-to-end.
- [ ] **Installation instructions** if any manual step is needed (e.g. adding
      the customer-card block, creating the automatic discount).

---

## Performance & technical quality (verify before submit)

Likely-pass, but demonstrate it:

- **Storefront Lighthouse** — the app injects no storefront scripts; the
  discount runs in a checkout Function. Run Lighthouse on a themed store with
  the app installed vs not, confirm <10-point delta. Keep the report.
- **Function performance** — Functions have CPU/instruction limits. The
  cart-lines logic is O(lines × brands); fine for realistic carts. No action
  expected.
- **App Bridge / embedded** — confirm the app loads embedded, uses session
  tokens, and sets no third-party cookies or localStorage. (Already true.)
- **Error handling** — the UIs surface errors (Polaris banners / inline card
  errors). Reviewers test failure paths; keep those graceful.

---

## The backend decision

Blockers 1 and 2 both require server code. Two ways to add it:

1. **Minimal serverless endpoint.** A single HTTPS function (Cloudflare Worker /
   Pages Function, since the SPA is already on Cloudflare Pages, or any Node
   host) handling `/webhooks/compliance` with HMAC verification + token
   exchange for the one metafield delete. Smallest footprint; keeps the
   frontend-only App Home as-is.

2. **Migrate to the Shopify Remix app template.** Brings OAuth/token exchange,
   webhook registration, and session handling out of the box. Heavier, but this
   is the well-trodden public-app path and the natural home if Phase 3 adds
   webhooks, billing, or background jobs. This is the migration already flagged
   in [CHANGELOG.md](CHANGELOG.md) under "deferred to Phase 3."

**Recommendation:** if public listing is truly the goal, migrate to Remix. The
compliance webhooks are exactly the "server-side state becomes necessary"
trigger, and doing it once via the template avoids hand-rolling auth + webhook
plumbing that review will scrutinize. If you want the lightest possible change
and are comfortable maintaining bespoke auth, the serverless endpoint works.

---

## Remediation roadmap

Ordered. Each step is a checkpoint.

1. **Decide distribution** — custom (stop) vs public (continue).
2. **Choose the backend** — serverless endpoint vs Remix migration.
3. **Stand up the backend host** with HTTPS; point `application_url` /
   `[auth].redirect_urls` at real URLs.
4. **Implement managed install + token exchange** (or accept the Remix
   template's built-ins).
5. **Add the three compliance webhooks** — TOML subscription + endpoint with
   HMAC (401 on bad HMAC) + `customers/redact` metafield delete.
6. **Add `app/uninstalled`** handling (recommended).
7. **Deploy + `shopify app deploy`**, verify webhooks register and fire
   (Shopify sends test compliance payloads you can trigger from the Partner
   Dashboard).
8. **Request Protected Customer Data Level 1** for the public app; complete the
   data-protection form.
9. **Produce listing assets** — icon, screenshots, copy, pricing, privacy
   policy, support contact.
10. **Prepare the demo store + reviewer instructions.**
11. **Run Lighthouse**, capture the report.
12. **Submit for review**; expect iteration.

---

## Quick answer

- **Can it be listed today?** No — no backend, so no compliance webhooks, no
  real install auth. Both are mandatory.
- **Is the app itself broken or non-compliant in design?** No. It's a valid
  custom app. Public listing simply demands infrastructure (a backend) and
  listing assets that a bespoke app never needed.
- **Smallest path to "listable"?** Add a serverless endpoint for the three
  compliance webhooks + token exchange, get Protected Customer Data approved,
  and build the listing. **Cleanest path:** migrate to the Remix template and do
  the same.

---

## References

- [App requirements checklist](https://shopify.dev/docs/apps/launch/app-requirements-checklist)
- [Privacy law compliance](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance)
- [App installation & managed installation](https://shopify.dev/docs/apps/build/authentication-authorization/app-installation)
- [Token exchange](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/token-exchange)
- [Protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data)
- [Shopify Remix app template](https://github.com/Shopify/shopify-app-template-remix)
