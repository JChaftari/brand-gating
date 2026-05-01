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
  for (const line of input.cart.lines) {
    const product = line.merchandise?.product;
    if (!product) continue;

    let bestPct = 0;
    for (const match of product.brandTagMatches ?? []) {
      if (!match.hasTag) continue;
      const pct = discountByTag.get(match.tag) ?? 0;
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
