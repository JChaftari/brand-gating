#!/usr/bin/env node
/**
 * One-time setup script — creates the custom.brand_list shop metafield definition.
 *
 * Usage:
 *   SHOPIFY_ACCESS_TOKEN=<token> SHOP_DOMAIN=<mystore.myshopify.com> node scripts/create-metafield-definition.js
 *
 * How to get the token:
 *   1. Shopify Partner Dashboard → Apps → brand-gating → API access
 *   2. Or: Store admin → Settings → Apps and sales channels → Develop apps
 *      → Create an app → Admin API access token with `write_metafield_definitions` scope
 *
 * This script is idempotent — running it twice does nothing harmful (Shopify returns a
 * userError if the definition already exists, which the script logs and exits cleanly).
 */

const SHOP_DOMAIN = process.env.SHOP_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

if (!SHOP_DOMAIN || !ACCESS_TOKEN) {
  console.error('Missing required env vars: SHOP_DOMAIN and SHOPIFY_ACCESS_TOKEN');
  process.exit(1);
}

const API_VERSION = '2026-01';
const endpoint = `https://${SHOP_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;

const mutation = `
  mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition {
        id
        name
        namespace
        key
        type { name }
        ownerType
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const variables = {
  definition: {
    name: 'Brand List',
    namespace: 'custom',
    key: 'brand_list',
    description: 'Registry of brands available for customer discount assignment.',
    type: 'json',
    ownerType: 'SHOP',
    access: {
      admin: 'MERCHANT_READ_WRITE',
      storefront: 'NONE',
    },
  },
};

async function run() {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': ACCESS_TOKEN,
    },
    body: JSON.stringify({ query: mutation, variables }),
  });

  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${await res.text()}`);
    process.exit(1);
  }

  const { data, errors } = await res.json();

  if (errors?.length) {
    console.error('GraphQL errors:', JSON.stringify(errors, null, 2));
    process.exit(1);
  }

  const { createdDefinition, userErrors } = data.metafieldDefinitionCreate;

  if (userErrors?.length) {
    // ALREADY_EXISTS is fine — definition was created in a previous run.
    const alreadyExists = userErrors.every(e => e.code === 'TAKEN');
    if (alreadyExists) {
      console.log('Metafield definition custom.brand_list already exists — nothing to do.');
      process.exit(0);
    }
    console.error('User errors:', JSON.stringify(userErrors, null, 2));
    process.exit(1);
  }

  console.log('Created metafield definition:');
  console.log(`  ID:         ${createdDefinition.id}`);
  console.log(`  Name:       ${createdDefinition.name}`);
  console.log(`  Namespace:  ${createdDefinition.namespace}`);
  console.log(`  Key:        ${createdDefinition.key}`);
  console.log(`  Type:       ${createdDefinition.type.name}`);
  console.log(`  Owner:      ${createdDefinition.ownerType}`);
  console.log('\nSetup Task 1 complete. Run scripts/seed-brand-list.js next.');
}

run().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
