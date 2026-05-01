#!/usr/bin/env node
/**
 * One-time setup script — seeds the shop's custom.brand_list metafield with the
 * three pre-existing brands (Acme, Beta, Gamma).
 *
 * Run AFTER create-metafield-definition.js.
 *
 * Usage:
 *   SHOPIFY_ACCESS_TOKEN=<token> SHOP_DOMAIN=<mystore.myshopify.com> node scripts/seed-brand-list.js
 *
 * What it does:
 *   1. Looks up the shop GID.
 *   2. For each brand, looks up the collection by handle (brand-acme, brand-beta,
 *      brand-gamma) and reads its featured image URL.
 *   3. Writes the assembled JSON to the shop's custom.brand_list metafield via
 *      metafieldsSet.
 *
 * Idempotent — re-running it overwrites the metafield with the same value.
 *
 * If a collection is missing, the script aborts with a clear error so you can
 * create it (or fix the handle) before retrying.
 */

const SHOP_DOMAIN = process.env.SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

if (!SHOP_DOMAIN || !ACCESS_TOKEN) {
  console.error('Missing required env vars: SHOP_DOMAIN and SHOPIFY_ACCESS_TOKEN');
  process.exit(1);
}

const API_VERSION = '2026-01';
const endpoint = `https://${SHOP_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;

const SEED_BRANDS = [
  { tag: 'brand-acme',  display_name: 'Brand Acme'  },
  { tag: 'brand-beta',  display_name: 'Brand Beta'  },
  { tag: 'brand-gamma', display_name: 'Brand Gamma' },
];

async function gql(query, variables) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': ACCESS_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const body = await res.json();
  if (body.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(body.errors, null, 2)}`);
  }
  return body.data;
}

async function fetchShopAndCollections() {
  // collectionByHandle accepts a single handle, so look up all brands in parallel via aliases.
  const query = `
    query SeedLookup {
      shop { id }
      ${SEED_BRANDS.map((b, i) => `
        c${i}: collectionByHandle(handle: "${b.tag}") {
          id
          handle
          image { url }
        }
      `).join('\n')}
    }
  `;

  return gql(query);
}

async function setBrandListMetafield(shopId, value) {
  const mutation = `
    mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key value }
        userErrors { field message code }
      }
    }
  `;

  const variables = {
    metafields: [
      {
        ownerId: shopId,
        namespace: 'custom',
        key: 'brand_list',
        type: 'json',
        value: JSON.stringify(value),
      },
    ],
  };

  const data = await gql(mutation, variables);
  const { metafields, userErrors } = data.metafieldsSet;

  if (userErrors?.length) {
    throw new Error(`metafieldsSet userErrors: ${JSON.stringify(userErrors, null, 2)}`);
  }

  return metafields[0];
}

async function run() {
  console.log('Looking up shop and brand collections...');
  const data = await fetchShopAndCollections();
  const shopId = data.shop.id;

  const brandList = [];
  const missing = [];

  SEED_BRANDS.forEach((brand, i) => {
    const collection = data[`c${i}`];
    if (!collection) {
      missing.push(brand.tag);
      return;
    }
    brandList.push({
      tag: brand.tag,
      display_name: brand.display_name,
      collection_id: collection.id,
      image_url: collection.image?.url ?? null,
    });
  });

  if (missing.length) {
    console.error(`\nMissing collections (handle not found): ${missing.join(', ')}`);
    console.error('Create these collections in the admin (or fix their handles) and retry.');
    process.exit(1);
  }

  console.log('\nAssembled brand list:');
  console.log(JSON.stringify(brandList, null, 2));

  console.log('\nWriting to shop metafield custom.brand_list...');
  const result = await setBrandListMetafield(shopId, brandList);

  console.log('\nSeed complete:');
  console.log(`  Metafield ID: ${result.id}`);
  console.log(`  Namespace:    ${result.namespace}`);
  console.log(`  Key:          ${result.key}`);
  console.log(`  ${brandList.length} brands written.`);
}

run().catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});
