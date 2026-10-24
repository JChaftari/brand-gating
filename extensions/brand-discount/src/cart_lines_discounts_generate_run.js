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

  const rawJson = customer.brandDiscounts?.value;
  if (!rawJson) {
    return { operations: [] };
  }

  /** @type {Array<{brand_tag: string, percentage: number}>} */
  let brandDiscounts;
  try {
    brandDiscounts = JSON.parse(rawJson);
  } catch (_) {
    return { operations: [] };
  }

  if (!Array.isArray(brandDiscounts) || brandDiscounts.length === 0) {
    return { operations: [] };
  }

  /** @type {Map<string, number>} */
  const discountByTag = new Map();
  for (const entry of brandDiscounts) {
    const tag = entry?.brand_tag;
    const pct = Number(entry?.percentage);
    if (!tag || !Number.isFinite(pct) || pct <= 0) continue;
    const existing = discountByTag.get(tag) ?? 0;
    if (pct > existing) discountByTag.set(tag, pct);
  }

  if (discountByTag.size === 0) {
    return { operations: [] };
  }

  // Map each brand collection back to its brand tag, from the discount's
  // input_variables (brandTags[i] ↔ brandCollectionIds[i]). Missing or
  // malformed config → empty map → products match on tags only.
  /** @type {Map<string, string>} */
  const tagByCollectionId = new Map();
  try {
    const config = JSON.parse(input.discount.brandConfig?.value ?? '{}');
    const tags = Array.isArray(config.brandTags) ? config.brandTags : [];
    const ids = Array.isArray(config.brandCollectionIds) ? config.brandCollectionIds : [];
    for (let i = 0; i < Math.min(tags.length, ids.length); i++) {
      if (tags[i] && ids[i]) tagByCollectionId.set(ids[i], tags[i]);
    }
  } catch (_) {
    // Fall through with an empty map.
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
