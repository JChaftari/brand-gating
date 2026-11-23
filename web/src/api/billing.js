// Subscription check for the public (App Store) app, billed through Shopify
// App Pricing ("managed pricing"): the plans are configured in the Partner
// Dashboard and merchants choose one on a Shopify-hosted page.
//
// Only the apps listed in BILLED_APP_CLIENT_IDS are billed this way. The
// customer's custom-distribution app shares this code but isn't on App Store
// pricing, so it must never be gated — that's why billing is keyed to the
// public app's client ID rather than applied to every app. The same list is
// in extensions/customer-brand-discounts/src/api.js.
//
// Plans: a free plan limited to FREE_PLAN_BRAND_LIMIT brands, and the paid
// `premium-plan` with no limit. Shopify App Pricing creates a subscription for
// free plans too (with $0 prices), so a store on the free plan has an ACTIVE
// subscription; it's told apart by its name (FREE_PLAN_NAME). Any other active
// plan — premium, or Shopify's private test plan — has no brand limit.
// The same rule is in extensions/customer-brand-discounts/src/api.js.

import { gql } from './graphql';

export const BILLED_APP_CLIENT_IDS = ['f9f32ac3ca8e90585fc52b8fda97b2d1'];

export const FREE_PLAN_BRAND_LIMIT = 2;
const FREE_PLAN_NAME = /\bfree\b/i;

const STATUS_QUERY = `
  query BillingStatus {
    currentAppInstallation {
      app { apiKey handle }
      activeSubscriptions { id name status }
    }
    shop { myshopifyDomain }
  }
`;

/**
 * What the store's active subscriptions allow.
 *
 * @param {Array<{ name: string, status: string }>} subscriptions
 * @returns {{ active: boolean, free: boolean, brandLimit: number }}
 *   active:     the store has an active plan
 *   free:       that plan is the free plan
 *   brandLimit: how many brands get discounts at checkout (Infinity = no limit,
 *               0 = no plan)
 */
export function planFromSubscriptions(subscriptions) {
  const active = (subscriptions ?? []).filter((s) => s?.status === 'ACTIVE');
  if (active.length === 0) return { active: false, free: false, brandLimit: 0 };
  const paid = active.some((s) => !FREE_PLAN_NAME.test(s.name ?? ''));
  return paid
    ? { active: true, free: false, brandLimit: Infinity }
    : { active: true, free: true, brandLimit: FREE_PLAN_BRAND_LIMIT };
}

/**
 * @returns {Promise<{ required: boolean, active: boolean, free: boolean,
 *   brandLimit: number, planUrl: string }>}
 *   required:   this app is billed (public app)
 *   active:     the store has an active plan
 *   free:       the active plan is the free plan
 *   brandLimit: brands that get discounts at checkout (Infinity = no limit)
 *   planUrl:    Shopify's plan selection page for this store and app
 */
export async function loadBillingStatus() {
  const data = await gql(STATUS_QUERY);
  const { app, activeSubscriptions } = data.currentAppInstallation;
  const storeHandle = data.shop.myshopifyDomain.replace(/\.myshopify\.com$/, '');
  return {
    required: BILLED_APP_CLIENT_IDS.includes(app.apiKey),
    ...planFromSubscriptions(activeSubscriptions),
    planUrl: `https://admin.shopify.com/store/${storeHandle}/charges/${app.handle}/pricing_plans`,
  };
}
