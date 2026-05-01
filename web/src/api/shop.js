import { gql } from './graphql';

// The shop GID is a stable identifier for the install — fetch once and cache
// for the lifetime of the page. metafieldsSet on shop-owned metafields requires
// the shop GID as ownerId.
let cachedShopId = null;

export async function getShopId() {
  if (cachedShopId) return cachedShopId;
  const data = await gql(`{ shop { id } }`);
  cachedShopId = data.shop.id;
  return cachedShopId;
}

// Test/dev escape hatch — clear the cache (e.g. between tests).
export function _resetShopIdCache() {
  cachedShopId = null;
}
