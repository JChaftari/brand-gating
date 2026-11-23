# Marketing kit

Free ways to get *Vendtier: Wholesale by Brand* its first installs and reviews:
listing tweaks to test, ready-to-send outreach messages, and post drafts.
Written November 2026, right after the app went live
(<https://apps.shopify.com/vendtier-wholesale-by-brand>).

Everything in `[brackets]` is a placeholder. Personalize every message:
generic messages are the ones that get no replies.

See also: [APP_STORE_LISTING.md](APP_STORE_LISTING.md) (the approved listing
copy these tweaks would change).

---

## Rules that apply to everything below

- **Reviews (Shopify policy, in force since 7 July 2026):** never offer
  anything for a review (no free month, no feature unlocks, no "thank you"
  gift), never ask for a *positive* or five-star review, never send review
  requests by email to merchants who didn't agree to email, never ask during
  onboarding, never pressure anyone to change a review. Breaking this can get
  a large share of the app's reviews removed. Ask only merchants who use the
  app, in neutral words, after it worked for them.
- **Cold email:** one store at a time, written for that store. Say who you
  are, include a postal address and a one-line opt-out, and stop at one
  follow-up. Only email addresses a store publishes for business contact.
  (CAN-SPAM in the US and CASL in Canada apply to the recipient's country; this
  isn't legal advice.)
- **Listing copy** keeps the App Store rules already followed in
  APP_STORE_LISTING.md: no superlatives, statistics, testimonials or Shopify
  trademarks, and no prices outside the Pricing section. Outreach messages
  aren't the listing, so they can mention the price and trial.

---

## 1. Listing tweaks to test

Change one thing at a time and give it 2–3 weeks, noting the app's position
for each search term before and after (search logged out, or in a private
window).

### Title (30 characters max)

The title appears to carry the most search weight, and "Vendtier" spends a
third of it on a word nobody searches. Candidates:

| Title | Chars | Covers |
|---|---|---|
| `Vendtier: Wholesale by Brand` (current) | 28 | wholesale, brand |
| `Vendtier: Wholesale Discounts` | 29 | wholesale, discount(s) |
| `Vendtier: B2B Brand Discounts` | 29 | B2B, brand, discount(s) |

Recommended first test: **`Vendtier: Wholesale Discounts`**. It matches the
most common phrase in this category, and the subtitle still carries the
per-brand idea.

To change it: rule 4.1.1 requires the app name in `shopify.app.toml` to match
the listing, so update `name` there and deploy along with the listing edit.
Check in the listing editor whether a name change sends the listing back to
review before submitting it.

### Subtitle

Current (keep unless testing): *Give each customer their own discount on each
brand you sell*

Alternative that adds the search words:
*Wholesale discounts per customer, set separately for each brand*

### Search terms

Current: `wholesale discount`, `customer pricing`, `brand discount`,
`B2B discount`, `automatic discount`.

Before changing them, search each candidate below and see which apps rank on
page one. Prefer terms where page one has apps with few reviews:

`wholesale pricing`, `customer specific discount`, `vendor discount`,
`trade discount`, `B2B pricing`, `tiered wholesale`, `customer discount`.

If the editor allows more than five, add the best of these instead of
replacing the current ones.

### Free plan (done 23 November 2026)

Paid-only apps with zero reviews are the most common reason new apps report
for installs that don't stick, so there's now a **Free plan for up to 2
brands**, with `premium-plan` for unlimited brands. Merchants can use the
app, see a real result and leave an honest review. Setup and behavior:
[SETUP.md §9](SETUP.md#9-billing-public-app-only). Outreach should lead with
it: "free for up to two brands" lowers the bar to trying it.

---

## 2. Finding stores to contact

Target: Shopify stores that **sell wholesale and carry several brands**
(distributors, multi-brand retailers in beauty, outdoor, pet, auto parts,
supplements, salon and spa supply).

Google searches that surface them:

- `"wholesale" "apply" inurl:collections/vendors` (Shopify stores expose a
  vendors page when they list brands)
- `"wholesale account" "brands we carry"`
- `"trade account" "our brands" "powered by shopify"`
- `inurl:pages/wholesale "brands"`

Other sources:

- **Competitor reviews:** read the 1- to 3-star reviews of the large
  wholesale apps for complaints about not being able to set discounts per
  vendor, brand or collection. Those merchants already have the problem.
- **Shopify Community and Facebook groups:** questions like "different
  discount per customer per vendor".

Track every contact in a simple sheet:

| Store | URL | Contact | Brands seen | Date sent | Follow-up | Reply | Installed | Set up | Review asked |
|---|---|---|---|---|---|---|---|---|---|

Pace: about 10 a day, each one personalized.

---

## 3. Outreach messages

### 3a. First email to a multi-brand wholesale store

**Subject:** Different wholesale discount per brand for [Store name]?

> Hi [first name or "[Store name] team"],
>
> I was looking at [Store name] and saw you carry [Brand A], [Brand B] and
> [Brand C] and offer wholesale accounts. Stores like yours often need a
> retailer to get, say, [20%] on [Brand A] but only [10%] on [Brand B],
> because the margins differ by brand. In Shopify that usually means
> discount codes per customer or manual draft orders.
>
> I built a small app, Vendtier, that does exactly that: you set each
> customer's discount for each brand on their customer page, and it applies
> automatically at checkout, with no codes.
>
> If it's useful, I'll set it up with you on a 15-minute call, free, using
> your real brands and one of your wholesale customers. It's free for up to
> two brands; for more, it's $19.99 a month with a 14-day free trial.
>
> https://apps.shopify.com/vendtier-wholesale-by-brand
>
> [Your name]
> Chaftari Development · [postal address]
> If this isn't relevant, reply "no" and I won't write again.

### 3b. One follow-up (5–7 days later, same thread)

> Hi [first name], just bringing this back up once. If per-brand discounts
> for your wholesale customers would help, I'm happy to do the setup with you
> (about 15 minutes). If not, no problem, and I won't follow up again.
>
> [Your name]

### 3c. Short version for Instagram, LinkedIn or a contact form

> Hi! I saw [Store name] sells [Brand A] and [Brand B] wholesale. I built a
> Shopify app that gives each wholesale customer their own discount on each
> brand, applied automatically at checkout. Happy to set it up with you for
> free on a quick call if that's useful. No worries if not!

### 3d. Merchant who left a low review on a competitor

> Hi [first name], I came across your review of [competitor app], where you
> mentioned [their exact complaint, for example "you can't set a different
> discount per vendor"]. I built Vendtier for that case: each customer gets
> their own discount per brand, applied automatically at checkout. If you're
> still looking, I'd be glad to set it up with you, free.
>
> [Your name], Chaftari Development · [postal address]
> Reply "no" and I won't write again.

Don't criticize the other app. Point only to the problem they described.

---

## 4. Community posts

### 4a. Shopify Community answer

Reply only where someone asks about per-customer, per-brand or per-vendor
wholesale discounts. Answer the question first.

> There are a few ways to do this:
>
> 1. **Shopify's built-in discounts:** a discount code limited to one
>    customer and one brand's collection works for a handful of customers,
>    but you need one code per customer-and-brand combination, and customers
>    have to remember and enter them.
> 2. **An app** that stores each customer's discount per brand. Disclosure:
>    I built one, Vendtier (https://apps.shopify.com/vendtier-wholesale-by-brand),
>    which applies them automatically at checkout. Other wholesale apps handle
>    per-customer price lists too.
>
> For your case ([their details]), I'd start with [honest recommendation].

Always say you built it. If the built-in option is enough for them, say so.

### 4b. Reddit launch post (r/ShopifyApps or r/SideProject, check each subreddit's rules first)

**Title:** I built a Shopify app for wholesale discounts that differ by brand.
Looking for feedback.

> I built this for a client whose store sells several brands to
> wholesale customers. Each retailer had negotiated different discounts per
> brand, and handling that with discount codes was a mess.
>
> So I built Vendtier: you register your brands, then set each customer's
> discount for each brand from the customer page. It's applied automatically
> at checkout through a Shopify discount function, so there's nothing to add
> to the theme.
>
> It just went live on the App Store:
> https://apps.shopify.com/vendtier-wholesale-by-brand
>
> I'd really like feedback from anyone who sells wholesale: does this match
> how you set wholesale terms? What would you need before using it?

### 4c. Facebook group post (no link in the post unless the group allows it)

> For anyone selling several brands wholesale: how do you handle retailers
> who get a different discount on each brand?
>
> I've seen people use one discount code per customer, separate price lists,
> or manual draft orders. Curious what works for you. (I built a small app for
> this after a client ran into it, happy to share it if anyone wants, but
> mostly interested in how others do it.)

---

## 5. Pitches to partners and writers

### 5a. Author of a "best Shopify wholesale apps" article

**Subject:** A per-brand option for your wholesale apps list

> Hi [name], I read your [article title]. One case it doesn't cover:
> stores that give each wholesale customer a different discount on each
> brand. That's the only thing Vendtier does, applied automatically at
> checkout with no codes.
>
> If you'd like to try it for an update, I'll set you up with a free
> account on a development store and walk you through it.
>
> https://apps.shopify.com/vendtier-wholesale-by-brand
>
> [Your name], Chaftari Development

Follow up once after a week, then stop.

### 5b. Agency or freelancer who builds B2B stores

> Hi [name], I saw you build wholesale and B2B stores on Shopify (for
> example [client or portfolio piece]). I make Vendtier, an app that gives each
> wholesale customer their own discount per brand, applied automatically at
> checkout. It's useful for clients who distribute several brands.
>
> If you have a client with this need, I'll do the setup with you or them for
> free, and I'm happy to add features you run into. Development stores are
> free to test on.

### 5c. A complementary B2B app (similar size, not a competitor)

Good fits: wholesale order forms, net terms or invoicing, B2B registration
and approval, quick order lists.

> Hi [name], I make Vendtier (per-brand wholesale discounts at checkout).
> Our apps solve neighboring parts of the same wholesale setup, and I think
> our merchants would use both. Would you be open to mentioning each other,
> for example a "works well with" line in our docs or onboarding, or a joint
> setup guide?

---

## 6. Content

### YouTube tutorial (public, unlike the review screencast)

**Title:** How to give wholesale customers a different discount per brand on
Shopify

**Description:**

> Step by step: set a separate wholesale discount for each customer on each
> brand you sell, applied automatically at checkout with no discount codes.
>
> 0:00 The problem: one retailer, different discounts per brand
> [timestamps from the recording]
>
> App used: Vendtier: Wholesale by Brand
> https://apps.shopify.com/vendtier-wholesale-by-brand

Show the problem first (a cart with two brands and the discount codes
alternative), then the setup, then the checkout result.

### Website pages (later)

The site at `brand-gating.pages.dev` only serves the privacy policy today.
Pages worth adding, in this order:

1. A one-page overview with the tutorial video.
2. "Per-brand wholesale discounts on Shopify: your options" (Shopify's
   built-in discounts, discount codes, apps), stated fairly.
3. Honest comparison pages against the largest wholesale apps, limited to
   facts from their public listings.

### First customer (custom app)

They can't review the public listing, because they use the separate custom
app. Ask them instead for a short case study for the website (with their
permission and their own words): what they were doing before, and what changed.

---

## 7. Asking for a review

The in-app request is already handled by
[web/src/api/reviews.js](../web/src/api/reviews.js) (Shopify's own pop-up,
only after brand discounts are in use). For merchants you've helped
personally:

- **At the end of a setup call where the discount worked:**
  "If you get a minute once you've used it a bit, a review on the App Store,
  whatever you think of it, helps a lot."
- **In a support reply after fixing their issue**, in the same conversation
  they started:

> Glad that's working now. If you have a moment, we'd value your honest
> feedback on the App Store, it helps us improve the app:
> https://apps.shopify.com/vendtier-wholesale-by-brand#modal-show=WriteReviewModal
> No pressure either way.

Ask each merchant once. If they don't leave one, don't ask again.

---

## 8. Milestones

| Milestone | What it unlocks |
|---|---|
| First 5 reviews | Better listing conversion; one of the Built for Shopify requirements |
| 50 net installs from active stores on paid Shopify plans + 5 reviews + good recent rating | Apply for **Built for Shopify** (Partner Dashboard → Distribution → Apply now): badge, search ranking boost, eligibility for the homepage and "Picked for you" |
| Good standing | Eligible for the weekly "In the spotlight" homepage pick (chosen by Shopify, not guaranteed) |
