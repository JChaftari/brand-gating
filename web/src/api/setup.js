// Setup guide progress for the Brands page (components/SetupGuide.jsx).
//
// Four steps get a merchant from install to a working brand discount:
//   1. Turn on brand discounts      — the store has the app's discount
//                                     (discountCount from useBrandList)
//   2. Add a brand                  — brand_list isn't empty
//   3. Add products to a brand      — any brand's collection has products,
//                                     or any product carries a brand's tag
//   4. Give a customer discounts    — the customer card has saved at least one
//                                     brand discount (it sets the shop flag
//                                     $app:brand-discount.customer_discounts_set),
//                                     or the discount has been used on an order
//
// Steps 1 and 2 come from data the page already has; this module answers 3
// and 4, and remembers whether the merchant hid the guide.

import { gql, assertNoUserErrors } from './graphql';
import { getShopId } from './shop';

const NS = '$app:brand-discount';
const KEY_CUSTOMER_SET = 'customer_discounts_set';
const KEY_HIDDEN = 'setup_guide_hidden';

// Enough to find a brand with products; keeps the query small.
const MAX_BRANDS_CHECKED = 10;

/**
 * @param {Array<{ tag: string, collection_id?: string }>} brands
 * @returns {Promise<{ productsAssigned: boolean, customerDiscountSet: boolean,
 *   hidden: boolean }>}
 */
export async function loadSetupProgress(brands) {
  const checked = brands.slice(0, MAX_BRANDS_CHECKED);
  const brandFields = checked
    .map((b, i) => {
      const collection = b.collection_id
        ? `c${i}: collection(id: ${JSON.stringify(b.collection_id)}) { productsCount { count } }`
        : '';
      const tagged = `t${i}: products(first: 1, query: ${JSON.stringify(`tag:"${b.tag}"`)}) { nodes { id } }`;
      return `${collection}\n${tagged}`;
    })
    .join('\n');

  const data = await gql(`
    query SetupProgress {
      shop {
        customerSet: metafield(namespace: "${NS}", key: "${KEY_CUSTOMER_SET}") { value }
        hidden: metafield(namespace: "${NS}", key: "${KEY_HIDDEN}") { value }
      }
      currentAppInstallation { app { apiKey } }
      discountNodes(first: 25, query: "type:app") {
        nodes {
          discount {
            ... on DiscountAutomaticApp { appDiscountType { appKey } asyncUsageCount }
          }
        }
      }
      ${brandFields}
    }
  `);

  const productsAssigned = checked.some(
    (_, i) =>
      (data[`c${i}`]?.productsCount?.count ?? 0) > 0 || (data[`t${i}`]?.nodes?.length ?? 0) > 0
  );

  const apiKey = data.currentAppInstallation.app.apiKey;
  const ordersDiscounted = data.discountNodes.nodes
    .map((n) => n.discount)
    .filter((d) => d?.appDiscountType?.appKey === apiKey)
    .reduce((sum, d) => sum + (d.asyncUsageCount ?? 0), 0);

  return {
    productsAssigned,
    customerDiscountSet: data.shop.customerSet?.value === 'true' || ordersDiscounted > 0,
    hidden: data.shop.hidden?.value === 'true',
  };
}

/** Remember that the merchant hid the setup guide (for every staff member). */
export async function hideSetupGuide() {
  const data = await gql(
    `mutation HideSetupGuide($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) { userErrors { field message } }
    }`,
    {
      metafields: [
        { ownerId: await getShopId(), namespace: NS, key: KEY_HIDDEN, type: 'boolean', value: 'true' },
      ],
    }
  );
  assertNoUserErrors(data.metafieldsSet, 'metafieldsSet (hide setup guide)');
}
