# Brand Gating — Phase 2 Build Spec

This spec defines the Phase 2 admin UI for the existing `brand-gating` Shopify app. Phase 1 (the discount function) is already deployed and working — do not modify it. This phase adds two admin surfaces for the merchant to manage brands and per-customer discount assignments without editing JSON or contacting a developer.

## Context

The existing `brand-gating` app contains a Shopify Function (`extensions/brand-discount`) that applies per-customer per-brand discounts at checkout. The function reads:

1. A customer-level metafield `custom.brand_discounts` (JSON) — a list of `{ brand_tag, percentage }` objects describing which brand discounts apply to that customer.
2. Product tags — products are tagged with strings like `brand-acme` to associate them with a brand. The function currently has these tags hardcoded as aliases (`hasAcme`, `hasBeta`, `hasGamma`).

The Phase 2 work introduces a third data structure — a **shop-level brand registry** — and adds two admin UI surfaces. It also restructures the function to read its brand list from this registry, eliminating the need to redeploy the function when a new brand is added.

## What gets built

### 1. Shop-level brand registry (data layer)

A new shop metafield `custom.brand_list` storing the canonical list of brands the merchant has registered. JSON shape:

```json
[
  {
    "tag": "brand-acme",
    "display_name": "Brand Acme",
    "collection_id": "gid://shopify/Collection/12345",
    "image_url": "https://cdn.shopify.com/.../brand-acme.jpg"
  }
]
```

Field meanings:
- `tag` — the product tag string (e.g., `brand-acme`). Used by the function to identify products belonging to this brand. Lowercase, hyphenated, no spaces.
- `display_name` — human-readable name shown in admin UIs (e.g., "Brand Acme").
- `collection_id` — GID of the collection auto-created when the brand was registered. Used for navigation and homepage tile linking.
- `image_url` — optional brand image, used for collection featured image and homepage tiles.

This metafield must be created as part of the build (see "Setup tasks" below).

### 2. Function update (refactor existing code)

Modify the existing function to read its brand list from the shop metafield instead of hardcoded aliases. Concrete changes:

- **`extensions/brand-discount/src/cart_lines_discounts_generate_run.graphql`**: replace the hardcoded `hasAcme`/`hasBeta`/`hasGamma` aliases. Read the shop metafield `custom.brand_list` to get all registered brand tags. Use `product.hasAnyTag(tags: $brandTags)` with `$brandTags` populated from the shop metafield.
- **`extensions/brand-discount/src/cart_lines_discounts_generate_run.js`**: update logic to iterate over all brands from the shop metafield and check each cart line's tags against them. Match each line's brand to the customer's discount JSON to find the applicable percentage.
- **`extensions/brand-discount/shopify.extension.toml`**: configure input variables to source from the shop metafield (`api_version` already 2026-01).

The customer metafield (`custom.brand_discounts`) shape stays unchanged — array of `{ brand_tag, percentage }`. Existing customer data continues to work without migration.

### 3. Standalone "Brands" admin page

A new app page accessible from `Apps → brand-gating → Brands` that lists registered brands and provides Add/Edit/Delete operations.

**UI layout:**
- Page header: "Brands" with a description like "Manage the brands available for customer discount assignment."
- Primary action button (top-right): "Add brand"
- Table listing existing brands with columns: Image (thumbnail), Display Name, Tag, Collection (link), Actions (Edit, Delete)

**Add brand form (modal or new page):**
- **Display Name** (required, text input) — e.g., "Brand Delta"
- **Brand Tag** (required, text input) — auto-populated from display name (lowercased, spaces to hyphens, e.g., `brand-delta`), but editable. Validate uniqueness against existing tags.
- **Brand Image** (optional, image upload) — single image, used as collection featured image and on homepage tiles.

On submit:
1. Validate tag uniqueness against the existing brand list.
2. Create a Shopify collection with the given display name and a handle matching the brand tag (e.g., handle `brand-delta`).
3. If an image was uploaded, attach it as the collection's featured image.
4. Append the new brand to the shop metafield's brand list.
5. Show a success toast: "Brand '{display_name}' added."
6. Show explicit follow-up guidance to the merchant:
   > Next steps:
   > 1. Tag your {display_name} products with `{tag}` (Products → bulk edit)
   > 2. Add the brand to your homepage tiles section in the theme editor

**Edit brand:**
- Modal with the same fields as Add brand.
- Display Name and Image are editable; updating display name updates the collection title; updating image updates the collection featured image.
- Tag is **read-only after creation** — changing a tag would orphan all currently-tagged products and customer JSON references. Show with a tooltip: "Brand tags cannot be changed after creation. Delete and re-create the brand if you need a different tag."
- On save: update the metafield entry and the underlying collection.

**Delete brand:**
- Confirmation modal: "Delete brand '{display_name}'? This will not delete the collection or product tags, but customers with discounts assigned to this brand will no longer receive them."
- On confirm: remove the brand entry from the shop metafield. Do NOT delete the collection or untag products — those are explicit destructive actions the merchant should perform separately if they want to.
- Show a warning if any customers currently have this brand in their `brand_discounts` metafield (count them via a query). Optional polish; skip if it complicates the build.

**Empty state:** if no brands are registered yet, show a centered call-to-action: "Register your first brand to start offering customer-specific discounts." with the Add brand button.

### 4. Embedded "Brand Discounts" card on the customer detail page

A Shopify Admin UI extension that injects a card onto the customer detail page (`/admin/customers/:id`).

**UI layout (Pattern A from design discussion):**
- Card title: "Brand Discounts"
- Table with columns: Brand (display name), Percentage, Actions (Edit, Remove)
- Below the table: "+ Add brand discount" button

**Add discount flow:**
- Click "+ Add brand discount" → a new editable row appears at the bottom.
- The row contains:
  - Brand selector (Polaris `Select` or `Combobox`) — populated from the shop's brand list metafield. Already-assigned brands are filtered out (a customer can't have two discounts on the same brand).
  - Percentage input (Polaris `TextField` with type=number) — validates 0–100.
  - Confirm (✓) and cancel (✕) icon buttons.
- On confirm: validate (brand selected, percentage in range), append to the customer's `brand_discounts` metafield array, write via `metafieldsSet` mutation, refresh the table, show success toast.
- On cancel: discard the row.

**Edit existing discount:**
- Click ✎ icon on a row → percentage cell becomes a number input.
- User types new value, presses Enter (or clicks ✓).
- Saves immediately, shows toast.

**Remove existing discount:**
- Click 🗑 icon on a row → small confirmation: "Remove this brand discount?"
- On confirm: remove the entry from the metafield, save, refresh table.

**Edge cases:**
- **Stale brands:** if the customer's metafield contains a brand tag that no longer exists in the shop's brand registry (brand was deleted), render that row with a warning icon and tooltip: "Brand no longer exists. Remove or restore the brand in app settings." Allow the merchant to delete the row but not edit the percentage. Hide it from the brand picker dropdown.
- **Empty state:** "No brand discounts yet." with a "+ Add the first one" button.
- **Loading state:** show a Polaris skeleton while fetching the metafield on initial load.
- **Save errors:** display error inline, keep the user's edit in the form, allow retry.

**Sorting:** rows sorted alphabetically by brand display name. No manual reordering.

## Permissions

No custom permission logic. Anyone with admin access to the store can use these UIs. This matches Shopify defaults. Document this in the handoff README; flag staff role restrictions as a Phase 3 enhancement.

## Tech stack

- **Admin UI extensions**: Shopify Admin UI extension framework (`@shopify/ui-extensions-react`).
- **Component library**: Polaris (Shopify's design system). Use Polaris components throughout — do not write custom CSS.
- **Backend**: Shopify Admin GraphQL API for metafield reads/writes and collection creation.
- **Language**: JavaScript (matching the function extension).
- **No custom backend or database**: all state lives in Shopify metafields.

## Setup tasks (one-time, before code)

1. Create the shop metafield definition: `custom.brand_list`, type JSON, admin/storefront access set to read/write where appropriate.
2. Migrate the existing brand list from hardcoded function aliases to the shop metafield. Seed it with the current 3 brands:
   ```json
   [
     { "tag": "brand-acme",  "display_name": "Brand Acme",  "collection_id": "<existing>", "image_url": "<existing>" },
     { "tag": "brand-beta",  "display_name": "Brand Beta",  "collection_id": "<existing>", "image_url": "<existing>" },
     { "tag": "brand-gamma", "display_name": "Brand Gamma", "collection_id": "<existing>", "image_url": "<existing>" }
   ]
   ```
   Look up the existing collection IDs and image URLs from the dev store admin and populate them in the seed data.

## Build order (recommended)

1. Create shop metafield definition and seed brand list (manual, one-time).
2. Refactor the function to read brand list from the metafield. Test that existing customer discounts still work end-to-end.
3. Generate the Admin UI extension scaffold for the standalone "Brands" page. Build Add/Edit/Delete flows.
4. Generate the Admin UI extension scaffold for the embedded customer-page card. Build Add/Edit/Remove flows.
5. End-to-end test: register a new brand via the UI, assign it to a customer via the customer-page card, place a test order, confirm the discount applies.
6. Update the project README with merchant-facing documentation: "How to manage brands and customer discounts."

## Out of scope

- Bulk operations (assign discounts to multiple customers at once) — defer to Phase 3 if requested.
- Search/filter on the per-customer discount table — defer to Phase 3 if needed.
- Audit log of who changed what when — defer to Phase 3.
- Staff role restrictions — defer to Phase 3.
- Automated product tagging when a brand is created — merchant tags products separately.
- Programmatic homepage tile updates — merchant updates the theme manually after registering a brand.
- Migrating customer metafield JSON to a richer schema — keep the existing `[{ brand_tag, percentage }]` shape.
- Bilingual / RTL support for the admin UIs — use Shopify Polaris defaults; admin language follows merchant settings.

## Acceptance criteria

The build is complete when:

1. The merchant can register a new brand via the standalone admin page. After registration:
   - The brand appears in the brand list.
   - A new collection with the brand's name and handle exists.
   - The brand's image is set as the collection featured image (if provided).
   - The shop metafield contains the new brand entry.

2. The merchant can edit a brand's display name and image (but not tag), and changes propagate to the underlying collection.

3. The merchant can delete a brand, removing it from the registry without deleting the collection or product tags.

4. On the customer detail page, the merchant sees a "Brand Discounts" card with the customer's current discounts.

5. The merchant can add, edit, and remove individual brand discounts on a customer, with changes saved to the customer metafield.

6. The brand selector in the customer-page card is populated from the shop's brand list and excludes already-assigned brands.

7. Stale brand entries (in customer metafield but missing from registry) are visually flagged.

8. The Shopify Function continues to apply correct per-customer per-brand discounts at checkout, sourcing its brand list from the shop metafield. Customer A and Customer B's existing discount data continues to work end-to-end.

9. No code paths require redeploying the function to add a new brand — the shop metafield is the single source of truth.
