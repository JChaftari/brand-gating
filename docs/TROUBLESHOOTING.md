# Troubleshooting

Symptom → cause → fix. Two sections: [merchant-facing](#merchant-facing)
(behavior at checkout / in admin) and [developer-facing](#developer-facing)
(build, deploy, and API issues encountered during development).

---

## Merchant-facing

### A discount isn't applying at checkout

Walk the three-part checklist — all must be true:

1. **Brand is registered.** Apps → brand-gating → Brands shows the brand.
2. **Products are tagged.** The product carries the brand's tag (e.g.
   `brand-acme`) — Products → bulk edit.
3. **Customer has a percentage.** The customer's Brand Discounts card lists the
   brand with a percentage > 0.

Plus two easy-to-miss requirements:

4. **Brand discounts are turned on.** If the Brands page shows a yellow "Brand
   discounts are off" banner, click **Turn on brand discounts** in it.
   (Choosing the app in Discounts → Create discount only opens the Brands page;
   the button is the way to create it.)
5. **The customer is logged in / identified at checkout.** The function reads
   the customer's assignments; an anonymous checkout gets no brand discount.

### A customer's discount row shows red "no longer registered"

The brand was deleted from the registry while the customer still had it
assigned. That discount does not apply at checkout. Click **Remove** on the row
to tidy it up. (Edit is intentionally hidden — changing the percentage would
have no effect.)

### The Brand Discounts card doesn't appear on a customer page

On the first visit to any customer, the card must be added once: in the
**Blocks** section click **Add block** and choose **Customer Brand Discounts**.
After that it appears on all customer pages automatically. (This is Shopify's
block-manager behavior, not something the app controls.)

### Pressing Enter doesn't save an inline edit

Known limitation of the card's number field. Use the **Save** button.

### A brand's image isn't showing

Images are set by pasting a Shopify Files URL, not uploaded in the form. Upload
via Content → Files, copy the image URL, paste it into the Brand image URL field
on the Add/Edit form. Make sure the URL is the direct CDN image URL.

### I need to change a brand's tag

Tags are immutable after creation (changing one would disconnect tagged products
and existing customer discounts). Delete the brand and create it again with the
desired tag, then re-tag products and re-assign customer discounts.

---

## Developer-facing

### Customer card shows a "Preview" badge and "Failed to fetch"

**Cause.** The store is still in a `shopify app dev` dev preview, which serves
extension code from your machine. Stopping `app dev` does not always end the
preview, so the block tries to load from a dev server that's gone.

**Fix.** Restore the released version on that store:
`shopify app dev clean --store <store>.myshopify.com` (add `--config custom`
for the customer app).

### `InvalidVariableValueError` / `$brandTags ... was provided invalid value` (STDIN null)

**Cause.** A discount using the function lacks the
`$app:brand-discount.input_variables` metafield, so `$brandTags` resolves to
null. If the input query declared it non-null (`[String!]!`), Shopify rejects
the entire input *before* the function runs.

**Fix.** Two parts, both already in the codebase — verify them if this recurs:
- The input query declares `$brandTags: [String!]` (nullable) with `= []`.
- Open the Brands page to trigger `selfHealBrandRegistry`, which seeds
  `input_variables` on any discount missing it. Or seed it manually per
  [SETUP.md §3c](SETUP.md#3c-seed-each-discounts-input_variables).

### `Variable definitions are missing` on function build/preview

**Cause.** The `[extensions.input.variables]` block in
`extensions/brand-discount/shopify.extension.toml` doesn't match a metafield
that exists, or uses an unsupported owner.

**Fix.** Input-variable metafields must live on the **function owner** (the
discount), not the shop. Confirm the TOML references
`namespace = "$app:brand-discount"`, `key = "input_variables"`, and that the
definition exists (SETUP §2b). See
[ARCHITECTURE — function input variables](ARCHITECTURE.md#decision-function-input-variables-live-on-the-discount).

### `This app is not approved to access the Customer object`

**Cause.** Protected Customer Data access isn't configured.

**Fix.** Request **Level 1** in the Partner Dashboard and declare
`custom.brand_discounts` — see [SETUP §4](SETUP.md#4-protected-customer-data-required-for-the-customer-card).
On dev stores it takes effect immediately.

### `Access denied for discountNodes field ... requires read_discounts`

**Cause.** Missing discount scopes.

**Fix.** `shopify.app.toml` must include
`read_discounts,write_discounts`. Re-run `shopify app dev` and accept the scope
update prompt.

### Customer card: script size exceeds 64 KB

**Cause.** The card is importing React /
`@shopify/ui-extensions-react`, which can't fit the 64 KB admin-extension limit.

**Fix.** The card must be Preact + web components. Ensure `package.json` depends
on `preact` (not `react`/`react-reconciler`/`ui-extensions-react`) and that
`tsconfig.json` sets `jsx: "react-jsx"` + `jsxImportSource: "preact"`. See
[ARCHITECTURE — Preact decision](ARCHITECTURE.md#decision-preact-not-react-for-the-admin-card).

### Customer card renders nothing / empty block

**Cause.** JSX isn't compiling to Preact (missing `tsconfig.json` JSX config), so
`render()` runs against non-functional output. The build succeeds because the
JSX is valid in either dialect.

**Fix.** Ensure `extensions/customer-brand-discounts/tsconfig.json` exists with
`jsx: "react-jsx"` and `jsxImportSource: "preact"`. Restart `shopify app dev`
and hard-reload.

### `Could not resolve "react-reconciler"`

**Cause.** A dependency (`@remote-ui/react`) peer-depends on `react-reconciler`,
which isn't auto-installed when the store's `.npmrc` disables `auto-install-peers`.
(Only relevant if the card ever uses the React stack — the shipped card is
Preact and doesn't hit this.)

**Fix.** Prefer the Preact stack. If React is unavoidable, add
`react-reconciler` (0.29.x for React 18) explicitly.

### npm peer-dependency conflict between `ui-extensions` and `ui-extensions-react`

**Cause.** `@shopify/ui-extensions-react` pins an **exact** `@shopify/ui-extensions`
peer version; a mismatched range breaks install.

**Fix.** Pin both to the compatible pair from
`npm view @shopify/ui-extensions-react@<ver> peerDependencies`. Don't use
`--force` / `--legacy-peer-deps` (they defer the break to runtime). Again, the
shipped card avoids this by using Preact.

### `npm warn workspaces ... no workspace folder present` / missing sibling deps after install

**Cause.** `npm install` was run inside a single extension folder, rewriting the
root lockfile to that workspace only.

**Fix.** From the repo root: `rm -rf node_modules package-lock.json && npm install`.
Always install from the root.

### Vite dev server: `EACCES: permission denied {{port}}`

**Cause.** The `{{port}}` placeholder reached Vite literally (CLI didn't
substitute it).

**Fix.** `web/shopify.web.toml` dev command should be plain `npm run dev`; Vite
reads `process.env.PORT` in `web/vite.config.js`. No `--port {{port}}` flag.

### `Field 'code' doesn't exist on type 'UserError'`

**Cause.** A `userErrors { ... code }` selection against a mutation whose
UserError subtype has no `code` field.

**Fix.** Select only `field` and `message` in userErrors — present on every
subtype. We don't branch on codes anyway.

### Collection link / `shopify:admin/...` navigation

The Brands table links collections via `shopify:admin/collections/<id>` URLs,
intercepted by App Bridge for in-admin navigation. If links don't navigate,
confirm the app is running embedded (App Bridge script loaded in `index.html`).

---

## Where to look

- Function run logs: Partner Dashboard → app → Extensions → brand-discount →
  run logs (shows STDIN/STDOUT and errors per checkout).
- Browser console on the customer page: card-side errors (surfaced as an inline
  message in the card too).
- Browser console / network on the Brands page: App Home Direct API Access
  errors (also surfaced in Polaris banners).
