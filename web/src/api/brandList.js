// =============================================================================
// Centralized brand registry helper
// =============================================================================
//
// THIS IS THE ONLY SUPPORTED WAY TO MUTATE THE BRAND REGISTRY.
//
// The registry is split across two metafield owners:
//
//   SHOP    custom.brand_list                  (json)
//     - Rich registry consumed by the admin UI.
//     - Shape: [{ tag, display_name, collection_id, image_url }]
//
//   DISCOUNT  $app:brand-discount.input_variables  (json)
//     - Function input-variable bag, one per automatic discount that uses our
//       brand-discount Shopify Function. Configured in shopify.extension.toml
//       as [extensions.input.variables].
//     - Shape: { "brandTags": [...] } — top-level keys match GraphQL variable
//       names in cart_lines_discounts_generate_run.graphql.
//     - Per-discount because Shopify Functions only support function-owner
//       metafields for input variables — see
//       https://shopify.dev/api/functions/input-query-variables.
//
// `syncBrandList` writes ALL of these in a single `metafieldsSet` call:
//   1 shop metafield + N discount metafields (one per discount using our function).
// metafieldsSet is atomic across all metafields in the call, so partial-write
// is impossible (see https://shopify.dev/changelog/metafieldsset-is-now-atomic).
//
// All Add / Edit / Delete brand flows in the admin UI MUST go through this
// helper. Do not call `metafieldsSet` for these keys from anywhere else.
//
// `selfHealBrandRegistry` is the partner function used at Brands-page-load
// time: it discovers discounts using our function, compares each one's
// input_variables against the canonical shop brand_list, and re-syncs if any
// are missing/stale. This handles discounts created via Shopify admin outside
// our UI.
// =============================================================================

import { gql, assertNoUserErrors } from './graphql';
import { getShopId } from './shop';

const NS_SHOP = 'custom';
const KEY_BRAND_LIST = 'brand_list';

const NS_DISCOUNT = '$app:brand-discount';
const KEY_INPUT_VARIABLES = 'input_variables';

// Used to identify our function among all functions installed on the shop.
// Matches the `handle` in extensions/brand-discount/shopify.extension.toml.
const FUNCTION_HANDLE = 'brand-discount';

// ---- queries / mutations ---------------------------------------------------

const READ_BRAND_LIST_QUERY = `
  query LoadBrandList {
    shop {
      id
      brandList: metafield(namespace: "${NS_SHOP}", key: "${KEY_BRAND_LIST}") {
        value
      }
    }
  }
`;

const FIND_FUNCTION_QUERY = `
  query FindBrandFunction {
    shopifyFunctions(first: 50) {
      nodes {
        id
        title
        apiType
      }
    }
  }
`;

const FIND_BRAND_DISCOUNTS_QUERY = `
  query FindBrandDiscounts {
    discountNodes(first: 100) {
      nodes {
        id
        discount {
          __typename
          ... on DiscountAutomaticApp {
            title
            appDiscountType { functionId }
          }
        }
        inputVariables: metafield(namespace: "${NS_DISCOUNT}", key: "${KEY_INPUT_VARIABLES}") {
          value
        }
      }
    }
  }
`;

// userErrors projects only { field, message }. metafieldsSet's UserError
// subtype does expose `code`, but we keep the projection portable across
// mutations (see web/src/api/collection.js for the rationale).
const SET_MUTATION = `
  mutation SetBrandRegistry($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key ownerType }
      userErrors { field message }
    }
  }
`;

// ---- public surface --------------------------------------------------------

/**
 * Load the canonical brand list from the shop's `custom.brand_list` metafield.
 * Returns an empty array if unset or unparseable.
 *
 * @returns {Promise<Array<Brand>>}
 */
export async function loadBrandList() {
  const data = await gql(READ_BRAND_LIST_QUERY);
  const raw = data.shop.brandList?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeBrand) : [];
  } catch {
    return [];
  }
}

/**
 * Atomic write of the brand registry.
 *
 * Writes the rich JSON to the shop's `custom.brand_list` AND derives + writes
 * the per-function input variables to every discount that uses our function.
 * All metafields are sent in one `metafieldsSet` call (atomic).
 *
 * @param {Array<Brand>} nextBrandList
 * @returns {Promise<{ brands: Array<Brand>, syncedDiscountCount: number }>}
 * @throws {Error}        on validation failure (no write attempted)
 * @throws {GraphQLError} on transport / GraphQL / userErrors response
 */
export async function syncBrandList(nextBrandList) {
  if (!Array.isArray(nextBrandList)) {
    throw new TypeError('syncBrandList: nextBrandList must be an array');
  }

  const normalized = nextBrandList.map(normalizeBrand);
  validateBrandList(normalized);

  const inputVariablesValue = JSON.stringify({
    brandTags: normalized.map((b) => b.tag),
  });

  // Discovery + shop ID in parallel — both are reads, both safe to fan out.
  const [shopId, brandDiscounts] = await Promise.all([
    getShopId(),
    discoverBrandDiscounts(),
  ]);

  const metafields = [
    {
      ownerId: shopId,
      namespace: NS_SHOP,
      key: KEY_BRAND_LIST,
      type: 'json',
      value: JSON.stringify(normalized),
    },
    ...brandDiscounts.map((d) => ({
      ownerId: d.id,
      namespace: NS_DISCOUNT,
      key: KEY_INPUT_VARIABLES,
      type: 'json',
      value: inputVariablesValue,
    })),
  ];

  const expectedCount = metafields.length;
  const data = await gql(SET_MUTATION, { metafields });
  assertNoUserErrors(data.metafieldsSet, 'metafieldsSet (brand list sync)');

  const written = data.metafieldsSet.metafields ?? [];
  if (written.length !== expectedCount) {
    throw new Error(
      `metafieldsSet (brand list sync): expected ${expectedCount} metafields written, got ${written.length}. ` +
        'Server state may be inconsistent — investigate before retrying.'
    );
  }

  return { brands: normalized, syncedDiscountCount: brandDiscounts.length };
}

/**
 * Self-healing check for the Brands page mount.
 *
 * Discovers all discounts using our function and ensures each one's
 * input_variables metafield matches the canonical shop brand_list. If any are
 * missing or stale, performs a full sync. This handles the case where a
 * merchant creates a new automatic discount via Shopify admin (outside our UI)
 * — that discount lands without a metafield and the function would crash for
 * it until we populate it.
 *
 * @returns {Promise<{ discountCount: number, healed: boolean }>}
 *   discountCount: total discounts using our function (0 means merchant has
 *                  none — caller should warn).
 *   healed: true iff a sync was performed during this call.
 */
export async function selfHealBrandRegistry() {
  const [brands, brandDiscounts] = await Promise.all([
    loadBrandList(),
    discoverBrandDiscounts(),
  ]);

  // Zero discounts → caller surfaces a banner. Nothing to heal.
  if (brandDiscounts.length === 0) {
    return { discountCount: 0, healed: false };
  }

  const expected = canonicalTagSetJson(brands.map((b) => b.tag));
  const drift = brandDiscounts.some((d) => {
    const raw = d.inputVariables?.value;
    if (!raw) return true; // missing
    try {
      const parsed = JSON.parse(raw);
      const actual = canonicalTagSetJson(parsed.brandTags ?? []);
      return actual !== expected;
    } catch {
      return true; // malformed
    }
  });

  if (!drift) {
    return { discountCount: brandDiscounts.length, healed: false };
  }

  // Heal. Pass the current shop list back through syncBrandList — same code
  // path as a normal save, so atomicity + invariants are preserved.
  await syncBrandList(brands);
  return { discountCount: brandDiscounts.length, healed: true };
}

// ---- internals -------------------------------------------------------------

let cachedFunctionId = null;

async function getBrandFunctionId() {
  if (cachedFunctionId) return cachedFunctionId;
  const data = await gql(FIND_FUNCTION_QUERY);
  const candidates = data.shopifyFunctions?.nodes ?? [];
  // Match by title (which is the locale-translated `name` from the extension's
  // en.default.json — currently "brand-discount"). Defensive: also accept a
  // case-insensitive match in case the title gets translated/changed.
  const fn = candidates.find(
    (f) =>
      typeof f.title === 'string' &&
      f.title.toLowerCase() === FUNCTION_HANDLE.toLowerCase()
  );
  if (!fn) {
    throw new Error(
      `Could not find the "${FUNCTION_HANDLE}" Shopify Function on this shop. ` +
        'Ensure the function extension is deployed (shopify app deploy).'
    );
  }
  cachedFunctionId = fn.id;
  return cachedFunctionId;
}

/**
 * Discover every automatic-app discount using our function, returning each
 * with its current input_variables metafield value (so callers can compare
 * without an extra round-trip).
 *
 * @returns {Promise<Array<{ id: string, inputVariables: { value: string }|null }>>}
 */
async function discoverBrandDiscounts() {
  const fnId = await getBrandFunctionId();
  const data = await gql(FIND_BRAND_DISCOUNTS_QUERY);
  return (data.discountNodes?.nodes ?? [])
    .filter(
      (n) =>
        n.discount?.__typename === 'DiscountAutomaticApp' &&
        n.discount?.appDiscountType?.functionId === fnId
    )
    .map((n) => ({ id: n.id, inputVariables: n.inputVariables ?? null }));
}

// Stable string representation of a tag set, used for drift comparison.
// Sort to make set equality order-independent — order doesn't matter to the
// function (hasTags returns one result per tag regardless).
function canonicalTagSetJson(tags) {
  const arr = Array.isArray(tags) ? [...tags].sort() : [];
  return JSON.stringify(arr);
}

// ---- normalization & validation --------------------------------------------

/**
 * @typedef {Object} Brand
 * @property {string} tag
 * @property {string} display_name
 * @property {string} collection_id
 * @property {string|null} [image_url]
 */

function normalizeBrand(b) {
  if (!b || typeof b !== 'object') {
    throw new TypeError('Brand entry must be an object');
  }
  return {
    tag: typeof b.tag === 'string' ? b.tag.trim().toLowerCase() : '',
    display_name: typeof b.display_name === 'string' ? b.display_name.trim() : '',
    collection_id: typeof b.collection_id === 'string' ? b.collection_id : '',
    image_url:
      typeof b.image_url === 'string' && b.image_url.trim() ? b.image_url.trim() : null,
  };
}

function validateBrandList(list) {
  const seenTags = new Set();
  for (const b of list) {
    if (!b.tag) {
      throw new Error('Brand entry missing required field: tag');
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(b.tag)) {
      throw new Error(
        `Invalid brand tag "${b.tag}": must be lowercase alphanumeric with hyphens (no leading hyphen)`
      );
    }
    if (!b.display_name) {
      throw new Error(`Brand "${b.tag}" missing required field: display_name`);
    }
    if (!b.collection_id) {
      throw new Error(`Brand "${b.tag}" missing required field: collection_id`);
    }
    if (seenTags.has(b.tag)) {
      throw new Error(`Duplicate brand tag in list: "${b.tag}"`);
    }
    seenTags.add(b.tag);
  }
}
