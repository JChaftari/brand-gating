# App Store listing kit

Everything needed to fill in the public app's listing and submission in the
Partner Dashboard: copy, images, screencast, reviewer testing instructions,
and the remaining decisions. Copy is written against Shopify's App Store rules
(no superlatives, statistics, testimonials or Shopify trademarks; pricing only
in the Pricing section). Exact character limits are shown by the listing
editor — trim there if any field is over.

Status of each item: see [APP_STORE_READINESS.md](APP_STORE_READINESS.md).

---

## Decisions still open

| Decision | Why it matters |
|---|---|
| **Pricing details** | Decided: paid with a free trial. Still needed: price per month, trial length, number of plans. Must use Shopify's managed pricing or Billing API (rule 1.2.1) and be described accurately (4.2.1). |
| **Support email, country** | Publisher decided: Chaftari Development. Email and country are shown on the listing and in the privacy policy (`web/public/privacy.html`). |
| **Icon** | Needs a distinctive mark without Shopify trademarks (4.4.3). |

---

## Listing copy

### App name

`Vendtier: Wholesale by Brand` (28 characters). Publisher: Chaftari Development.
The public app's name in `shopify.app.toml` matches it (rule 4.1.1).

### Subtitle

> Give each customer their own discount on each brand you sell

### Introduction

> Set a different discount for every customer on every brand. Applied automatically at checkout.

### Details

> Vendtier lets you set wholesale pricing brand by brand. Register the brands you sell, then give any customer their own percentage off each brand right from their customer page — for example 15% off one brand and 5% off another for a wholesale account. Products count toward a brand when they're in its collection or carry its tag. Discounts apply automatically at checkout with no codes to share, and they combine with your order and shipping discounts.

### Key features

1. Register brands once; each brand gets its own collection
2. Set per-customer, per-brand percentages on the customer page
3. Discounts apply automatically at checkout, with no codes
4. Assign products to a brand by collection or by tag

### Search terms (up to 5)

`wholesale discount`, `customer pricing`, `brand discount`, `B2B discount`,
`automatic discount`

### Category

Pricing / discounts (choose the closest category the editor offers).

### Pricing section

Paid, with a free trial. *Fill in the price and trial length once decided*,
matching the plan configured in Shopify exactly (rule 4.2.1).

### Privacy policy URL

`https://brand-gating.pages.dev/privacy` (served from `web/public/privacy.html`;
publish only after the placeholders are filled in).

---

## Screenshots

Show the real admin UI only — no browser window or desktop, no logo-only
images, each one a different view (rules 4.4.4, 4.4.5). Use a tidy demo store
with realistic brand and product names.

1. **Brands page** — 3–4 brands with images, the green **On** badge visible.
2. **Add brand** — the modal with a display name filled in and its tag generated.
3. **Customer page** — the pinned Brand Discounts card with several brands and
   percentages.
4. **Adding a discount** — the card's new row with the brand dropdown open.
5. **Checkout** — a cart showing "Brand discount 15% off" on a line, and a
   different brand at a different percentage on another line.

---

## Screencast (required, rule 4.5.3)

English, step by step, covering setup and every feature in the listing.
About 2–3 minutes:

1. Install the app; open it from **Apps** (the Brands page).
2. Click **Turn on brand discounts**; show the **On** badge.
3. Add a brand; show its new collection.
4. Add a product to that collection (and show tagging as the alternative).
5. Open a customer → **+ Block** → **Customer Brand Discounts** → **pin** it →
   add the brand at 20% → Save.
6. Edit the percentage, then remove and re-add it to show both actions.
7. On the storefront, log in as that customer, add the product to the cart and
   go to checkout: "Brand discount 20% off" appears automatically.
8. Show a product from a brand the customer has no discount on: no discount.

---

## Testing instructions for reviewers

Paste into the submission's testing instructions. The app has no separate
account or login, so no credentials are needed (rules 4.5.4–4.5.5).

> 1. Install the app and open it from Apps. This is the Brands page.
> 2. Click **Turn on brand discounts** in the yellow banner. A green **On** badge appears. (Choosing this app under Discounts → Create discount also opens this page.)
> 3. Click **Add brand**, enter "Test Brand" and click **Add brand**. A "Test Brand" collection is created.
> 4. Add any product to the "Test Brand" collection (Products → Collections). Alternatively, tag a product with `test-brand`.
> 5. Open a customer (Customers). In the **Blocks** section click **+ Block**, choose **Customer Brand Discounts**, then click the block's **pin icon** so it stays. Click **+ Add the first one**, choose Test Brand, enter 20, click **Save**.
> 6. On the storefront, sign in as that customer, add the product to the cart and go to checkout. The line shows "Brand discount 20% off".
>
> The app only reads customer data needed for the discounts (Protected Customer Data level 1; no names, emails, phone numbers or addresses).

---

## Other submission items

- **Emergency developer contact** in the Partner Dashboard (rule 4.5.6).
- **Protected Customer Data** request + Data protection details — answers in
  [APP_STORE_READINESS.md](APP_STORE_READINESS.md#protected-customer-data--data-protection-answers).
- **Storefront performance:** the app adds no code to the storefront (the
  discount runs inside Shopify's checkout), so it can't lower Lighthouse
  scores. A before/after Lighthouse run on the demo store is optional evidence.
