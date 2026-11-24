// Direct API Access from inside the admin UI extension iframe.
//
// `shopify.query(query, { variables })` is the global Shopify provides for
// running Admin GraphQL — equivalent to fetching `shopify:admin/api/...` from
// the App Home, but tailored for the extension sandbox. Same call works for
// queries and mutations.

// Apps billed through Shopify App Pricing (the public app). Same list as
// web/src/api/billing.js; the customer's custom app isn't billed and is never
// locked.
const BILLED_APP_CLIENT_IDS = ['f9f32ac3ca8e90585fc52b8fda97b2d1'];

// Free plan: only the first FREE_PLAN_BRAND_LIMIT registered brands get
// discounts at checkout. A store is on it when every active subscription's
// name says "free"; any other active plan has no limit. Same rule as
// planFromSubscriptions in web/src/api/billing.js.
const FREE_PLAN_BRAND_LIMIT = 2;
const FREE_PLAN_NAME = /\bfree\b/i;

// The shop's GID, from the last load; saves use it to record setup progress.
let cachedShopId = null;

const LOAD_QUERY = `
  query LoadCustomerBrandData($customerId: ID!) {
    customer(id: $customerId) {
      brandDiscounts: metafield(namespace: "$app:brand-discount", key: "brand_discounts") {
        id
        value
      }
    }
    shop {
      id
      brandList: metafield(namespace: "$app:brand-discount", key: "brand_list") {
        value
      }
    }
    currentAppInstallation {
      app { apiKey }
      activeSubscriptions { name status }
    }
  }
`;

const SAVE_MUTATION = `
  mutation SaveCustomerBrandDiscounts($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key }
      userErrors { field message }
    }
  }
`;

/**
 * Combined load: customer's brand_discounts + shop's brand_list + plan status,
 * single round-trip.
 *
 * @param {string} customerId  GID of the customer being viewed
 * @returns {Promise<{ discounts: Array, brands: Array, needsPlan: boolean,
 *   brandLimit: number }>}
 *   needsPlan:  billed app without an active plan — the card must not allow edits
 *   brandLimit: how many of `brands` (in order) get discounts at checkout;
 *               Infinity when there's no limit
 * @throws {Error} on transport / GraphQL errors
 */
export async function loadCustomerBrandData(customerId) {
  const result = await shopify.query(LOAD_QUERY, {
    variables: { customerId },
  });

  if (result.errors?.length) {
    throw new Error(`GraphQL: ${result.errors.map((e) => e.message).join('; ')}`);
  }

  cachedShopId = result.data?.shop?.id ?? null;
  const discountsRaw = result.data?.customer?.brandDiscounts?.value;
  const brandsRaw = result.data?.shop?.brandList?.value;

  const install = result.data?.currentAppInstallation;
  const billed = BILLED_APP_CLIENT_IDS.includes(install?.app?.apiKey);
  const activeSubs = (install?.activeSubscriptions ?? []).filter((s) => s.status === 'ACTIVE');
  const freeOnly =
    activeSubs.length > 0 && activeSubs.every((s) => FREE_PLAN_NAME.test(s.name ?? ''));

  return {
    discounts: safeParseArray(discountsRaw),
    brands: safeParseArray(brandsRaw),
    needsPlan: billed && activeSubs.length === 0,
    brandLimit: billed && freeOnly ? FREE_PLAN_BRAND_LIMIT : Infinity,
  };
}

/**
 * Persist the customer's full brand_discounts array. The array is a complete
 * replacement (not a delta) — caller is responsible for building the next
 * intended state from the existing rows.
 *
 * @param {string} customerId
 * @param {Array<{brand_tag: string, percentage: number}>} discounts
 * @throws {Error} on transport / GraphQL / userErrors
 */
export async function saveCustomerBrandDiscounts(customerId, discounts) {
  const metafields = [
    {
      ownerId: customerId,
      namespace: '$app:brand-discount',
      key: 'brand_discounts',
      type: 'json',
      value: JSON.stringify(discounts),
    },
  ];
  // Marks the Brands page's setup guide step "Give a customer their brand
  // discounts" as done (see web/src/api/setup.js). Same atomic call.
  if (discounts.length > 0 && cachedShopId) {
    metafields.push({
      ownerId: cachedShopId,
      namespace: '$app:brand-discount',
      key: 'customer_discounts_set',
      type: 'boolean',
      value: 'true',
    });
  }
  const result = await shopify.query(SAVE_MUTATION, { variables: { metafields } });

  if (result.errors?.length) {
    throw new Error(`GraphQL: ${result.errors.map((e) => e.message).join('; ')}`);
  }

  const userErrors = result.data?.metafieldsSet?.userErrors ?? [];
  if (userErrors.length) {
    const msg = userErrors
      .map((e) => `${e.field?.join('.') || '(no field)'}: ${e.message}`)
      .join('; ');
    throw new Error(`metafieldsSet: ${msg}`);
  }

  return result.data?.metafieldsSet?.metafields ?? [];
}

function safeParseArray(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
