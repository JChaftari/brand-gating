// Subscription check for the public (App Store) app, billed through Shopify
// App Pricing ("managed pricing"): the plan is configured in the Partner
// Dashboard and merchants choose it on a Shopify-hosted page.
//
// Only the apps listed in BILLED_APP_CLIENT_IDS are billed this way. The
// customer's custom-distribution app shares this code but isn't on App Store
// pricing, so it must never be gated — that's why billing is keyed to the
// public app's client ID rather than applied to every app. The same list is
// in extensions/customer-brand-discounts/src/api.js.

import { gql } from './graphql';

export const BILLED_APP_CLIENT_IDS = ['f9f32ac3ca8e90585fc52b8fda97b2d1'];

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
 * @returns {Promise<{ required: boolean, active: boolean, planUrl: string }>}
 *   required: this app is billed (public app)
 *   active:   the store has an active plan
 *   planUrl:  Shopify's plan selection page for this store and app
 */
export async function loadBillingStatus() {
  const data = await gql(STATUS_QUERY);
  const { app, activeSubscriptions } = data.currentAppInstallation;
  const storeHandle = data.shop.myshopifyDomain.replace(/\.myshopify\.com$/, '');
  return {
    required: BILLED_APP_CLIENT_IDS.includes(app.apiKey),
    active: activeSubscriptions.some((s) => s.status === 'ACTIVE'),
    planUrl: `https://admin.shopify.com/store/${storeHandle}/charges/${app.handle}/pricing_plans`,
  };
}
