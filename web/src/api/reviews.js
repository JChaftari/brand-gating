// App Store review request (App Bridge Reviews API).
//
// Shopify shows its own review modal and decides whether to: at most once per
// 60 days and three times per 365 days per merchant, never once they've
// reviewed, never on mobile or within 24 h of install. Its wording can't be
// customized. Development stores skip those limits (handy for testing; their
// reviews aren't published).
//
// When we ask: only after the app has delivered value — the store's brand
// discount has been applied to at least one order (asyncUsageCount) — and at
// most once per 60 days from our side too (recorded on the shop), so we don't
// call on every Brands-page visit. Never from the customer-card admin block:
// App Store rule 2.2.6 forbids review requests in admin extensions.
//
// Only the billed (public App Store) app asks; the customer's custom app has
// no App Store listing to review.

import { gql, assertNoUserErrors } from './graphql';

const NAMESPACE = '$app:brand-discount';
const KEY_REQUESTED_AT = 'review_requested_at';
const MIN_ORDERS_DISCOUNTED = 1;
const ASK_AGAIN_AFTER_DAYS = 60;

// Shopify's answers that mean "don't ask again for a while". Others (mobile,
// installed < 24 h, ineligible, already open) leave nothing recorded, so a
// later visit can try again.
const RECORD_CODES = new Set([
  'success',
  'cooldown-period',
  'annual-limit-reached',
  'already-reviewed',
]);

const ELIGIBILITY_QUERY = `
  query ReviewEligibility {
    currentAppInstallation { app { apiKey } }
    shop {
      id
      reviewRequestedAt: metafield(namespace: "${NAMESPACE}", key: "${KEY_REQUESTED_AT}") { value }
    }
    discountNodes(first: 25, query: "type:app") {
      nodes {
        discount {
          ... on DiscountAutomaticApp {
            appDiscountType { appKey }
            asyncUsageCount
          }
        }
      }
    }
  }
`;

const RECORD_MUTATION = `
  mutation RecordReviewRequest($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors { field message }
    }
  }
`;

/**
 * Ask Shopify to show its review modal if this store qualifies. Never throws:
 * a review request must not break or interrupt the app.
 *
 * @returns {Promise<string>} what happened, for logging ('not-eligible',
 *   'asked-recently', or Shopify's result code)
 */
export async function maybeRequestReview() {
  try {
    const data = await gql(ELIGIBILITY_QUERY);
    const apiKey = data.currentAppInstallation.app.apiKey;

    const lastAsked = Date.parse(data.shop.reviewRequestedAt?.value ?? '');
    if (lastAsked && Date.now() - lastAsked < ASK_AGAIN_AFTER_DAYS * 86_400_000) {
      return 'asked-recently';
    }

    const ordersDiscounted = data.discountNodes.nodes
      .map((n) => n.discount)
      .filter((d) => d?.appDiscountType?.appKey === apiKey)
      .reduce((sum, d) => sum + (d.asyncUsageCount ?? 0), 0);
    if (ordersDiscounted < MIN_ORDERS_DISCOUNTED) return 'not-eligible';

    const result = await window.shopify.reviews.request();
    if (RECORD_CODES.has(result.code)) {
      const saved = await gql(RECORD_MUTATION, {
        metafields: [
          {
            ownerId: data.shop.id,
            namespace: NAMESPACE,
            key: KEY_REQUESTED_AT,
            type: 'date_time',
            value: new Date().toISOString(),
          },
        ],
      });
      assertNoUserErrors(saved.metafieldsSet, 'metafieldsSet');
    }
    return result.code;
  } catch (err) {
    console.warn('Review request skipped:', err);
    return 'error';
  }
}
