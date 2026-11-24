import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from '../generated/api';

/**
 * @typedef {import("../generated/api").CartInput} RunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 */

/**
 * @param {RunInput} input
 * @returns {CartLinesDiscountsGenerateRunResult}
 */
export function cartLinesDiscountsGenerateRun(input) {
  if (!input.cart.lines.length) {
    return { operations: [] };
  }

  if (!input.discount.discountClasses.includes(DiscountClass.Product)) {
    return { operations: [] };
  }

  const customer = input.cart.buyerIdentity?.customer;
  if (!customer) {
    return { operations: [] };
  }

  // The discount's config (input_variables): brand tags, their collections
  // (brandTags[i] ↔ brandCollectionIds[i]) and customer-tag tiers. Missing or
  // malformed → empty → products match on tags only, and no tiers apply.
  /** @type {{ brandTags?: string[], brandCollectionIds?: string[],
   *   tiers?: Array<{ tag: string, discounts: Array<{brand_tag: string, percentage: number}> }> }} */
  let config = {};
  try {
    config = JSON.parse(input.discount.brandConfig?.value ?? '{}') ?? {};
  } catch (_) {
    config = {};
  }

  // The customer's own discounts take priority over tier discounts for the
  // same brand: the merchant set them for this customer specifically.
  const ownByTag = bestPercentByBrand(parseJsonArray(customer.brandDiscounts?.value));

  // Tier discounts: every tier whose tag the customer has; the best
  // percentage per brand when several tiers cover the same brand.
  const customerTierTags = new Set();
  for (const match of customer.tierMatches ?? []) {
    if (match?.hasTag) customerTierTags.add(match.tag.toLowerCase());
  }
  const tierEntries = [];
  for (const tier of Array.isArray(config.tiers) ? config.tiers : []) {
    if (typeof tier?.tag !== 'string' || !customerTierTags.has(tier.tag.toLowerCase())) continue;
    if (Array.isArray(tier.discounts)) tierEntries.push(...tier.discounts);
  }
  const tierByTag = bestPercentByBrand(tierEntries);

  /** @type {Map<string, number>} */
  const discountByTag = new Map(tierByTag);
  for (const [tag, pct] of ownByTag) discountByTag.set(tag, pct);

  if (discountByTag.size === 0) {
    return { operations: [] };
  }

  /** @type {Map<string, string>} */
  const tagByCollectionId = new Map();
  const tags = Array.isArray(config.brandTags) ? config.brandTags : [];
  const ids = Array.isArray(config.brandCollectionIds) ? config.brandCollectionIds : [];
  for (let i = 0; i < Math.min(tags.length, ids.length); i++) {
    if (tags[i] && ids[i]) tagByCollectionId.set(ids[i], tags[i]);
  }

  const candidates = [];

  // brandTagMatches can arrive as one of three things:
  //   1. A populated array → normal case; iterate and match.
  //   2. An empty array     → $brandTags resolved to [] (registry is empty);
  //                           inner loop iterates zero times → no candidates.
  //   3. null / undefined   → $brandTags resolved to null (discount lacks the
  //                           input_variables metafield, e.g. created via
  //                           Shopify admin outside our admin UI). The `?? []`
  //                           coalesces this to case 2 — no crash, no spurious
  //                           discounts.
  // selfHealBrandRegistry in the admin UI populates the metafield on next
  // Brands-page visit, restoring case 1 for that discount.
  // brandCollectionMatches follows the same three cases.
  for (const line of input.cart.lines) {
    const product = line.merchandise?.product;
    if (!product) continue;

    // A product belongs to a brand if it has the brand's tag OR is in the
    // brand's collection.
    const lineBrandTags = new Set();
    for (const match of product.brandTagMatches ?? []) {
      if (match.hasTag) lineBrandTags.add(match.tag);
    }
    for (const match of product.brandCollectionMatches ?? []) {
      if (!match.isMember) continue;
      const tag = tagByCollectionId.get(match.collectionId);
      if (tag) lineBrandTags.add(tag);
    }

    let bestPct = 0;
    for (const tag of lineBrandTags) {
      const pct = discountByTag.get(tag) ?? 0;
      if (pct > bestPct) bestPct = pct;
    }

    if (bestPct > 0) {
      candidates.push({
        message: `Brand discount ${bestPct}% off`,
        targets: [{ cartLine: { id: line.id } }],
        value: { percentage: { value: bestPct } },
      });
    }
  }

  if (candidates.length === 0) {
    return { operations: [] };
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}

/** JSON array from a metafield value; anything else → []. */
function parseJsonArray(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

/**
 * brand tag → highest valid percentage among the entries.
 * @param {Array<{brand_tag?: string, percentage?: number}>} entries
 * @returns {Map<string, number>}
 */
function bestPercentByBrand(entries) {
  const byTag = new Map();
  for (const entry of entries) {
    const tag = entry?.brand_tag;
    const pct = Number(entry?.percentage);
    if (!tag || !Number.isFinite(pct) || pct <= 0 || pct > 100) continue;
    if (pct > (byTag.get(tag) ?? 0)) byTag.set(tag, pct);
  }
  return byTag;
}
