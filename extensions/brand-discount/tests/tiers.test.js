// Unit tests for cart_lines_discounts_generate_run: per-customer brand
// discounts and customer-tag tiers.
import { describe, test, expect } from 'vitest';
import { cartLinesDiscountsGenerateRun } from '../src/cart_lines_discounts_generate_run.js';

const config = (extra = {}) => ({
  brandTags: ['brand-a', 'brand-b'],
  brandCollectionIds: ['gid://shopify/Collection/1', 'gid://shopify/Collection/2'],
  ...extra,
});

// line i belongs to the brand tag(s) given (by product tag).
function input({ own, tierMatches, cfg, lines = [['brand-a'], ['brand-b']] }) {
  return {
    cart: {
      buyerIdentity: {
        customer: {
          brandDiscounts: own === undefined ? null : { value: JSON.stringify(own) },
          tierMatches,
        },
      },
      lines: lines.map((brandTags, i) => ({
        id: `gid://shopify/CartLine/${i}`,
        merchandise: {
          product: {
            brandTagMatches: ['brand-a', 'brand-b'].map((t) => ({ tag: t, hasTag: brandTags.includes(t) })),
            brandCollectionMatches: [],
          },
        },
      })),
    },
    discount: {
      discountClasses: ['PRODUCT'],
      brandConfig: cfg === null ? null : { value: JSON.stringify(cfg ?? config()) },
    },
  };
}

// cart line index → percentage applied
function applied(result) {
  const out = {};
  for (const op of result.operations) {
    for (const c of op.productDiscountsAdd?.candidates ?? []) {
      out[c.targets[0].cartLine.id.split('/').pop()] = c.value.percentage.value;
    }
  }
  return out;
}

const gold = { tag: 'Gold', discounts: [{ brand_tag: 'brand-a', percentage: 25 }, { brand_tag: 'brand-b', percentage: 15 }] };
const silver = { tag: 'silver', discounts: [{ brand_tag: 'brand-a', percentage: 30 }] };

describe('per-customer discounts (unchanged behavior)', () => {
  test('own discounts apply per brand', () => {
    const r = cartLinesDiscountsGenerateRun(
      input({ own: [{ brand_tag: 'brand-a', percentage: 20 }, { brand_tag: 'brand-b', percentage: 10 }], tierMatches: [] })
    );
    expect(applied(r)).toEqual({ 0: 20, 1: 10 });
  });

  test('no customer → nothing', () => {
    const i = input({ own: [{ brand_tag: 'brand-a', percentage: 20 }], tierMatches: [] });
    i.cart.buyerIdentity.customer = null;
    expect(applied(cartLinesDiscountsGenerateRun(i))).toEqual({});
  });

  test('message text unchanged', () => {
    const r = cartLinesDiscountsGenerateRun(input({ own: [{ brand_tag: 'brand-a', percentage: 20 }], tierMatches: [] }));
    expect(r.operations[0].productDiscountsAdd.candidates[0].message).toBe('Brand discount 20% off');
  });

  test('missing config still applies own discounts by product tag', () => {
    const r = cartLinesDiscountsGenerateRun(input({ own: [{ brand_tag: 'brand-a', percentage: 20 }], tierMatches: null, cfg: null }));
    expect(applied(r)).toEqual({ 0: 20 });
  });
});

describe('customer-tag tiers', () => {
  test('tier applies to a customer with the tag and no own discounts', () => {
    const r = cartLinesDiscountsGenerateRun(
      input({ own: undefined, tierMatches: [{ tag: 'Gold', hasTag: true }], cfg: config({ tiers: [gold] }) })
    );
    expect(applied(r)).toEqual({ 0: 25, 1: 15 });
  });

  test('customer without the tag gets nothing from the tier', () => {
    const r = cartLinesDiscountsGenerateRun(
      input({ own: undefined, tierMatches: [{ tag: 'Gold', hasTag: false }], cfg: config({ tiers: [gold] }) })
    );
    expect(applied(r)).toEqual({});
  });

  test("own discount overrides the tier for that brand only (even if lower)", () => {
    const r = cartLinesDiscountsGenerateRun(
      input({
        own: [{ brand_tag: 'brand-a', percentage: 10 }],
        tierMatches: [{ tag: 'Gold', hasTag: true }],
        cfg: config({ tiers: [gold] }),
      })
    );
    expect(applied(r)).toEqual({ 0: 10, 1: 15 });
  });

  test('several tiers: best percentage per brand', () => {
    const r = cartLinesDiscountsGenerateRun(
      input({
        own: undefined,
        tierMatches: [{ tag: 'Gold', hasTag: true }, { tag: 'silver', hasTag: true }],
        cfg: config({ tiers: [gold, silver] }),
      })
    );
    expect(applied(r)).toEqual({ 0: 30, 1: 15 });
  });

  test('tag match ignores case', () => {
    const r = cartLinesDiscountsGenerateRun(
      input({ own: undefined, tierMatches: [{ tag: 'gold', hasTag: true }], cfg: config({ tiers: [gold] }) })
    );
    expect(applied(r)).toEqual({ 0: 25, 1: 15 });
  });

  test('no tiers in config (free plan) → tier tags ignored', () => {
    const r = cartLinesDiscountsGenerateRun(
      input({ own: undefined, tierMatches: [{ tag: 'Gold', hasTag: true }], cfg: config() })
    );
    expect(applied(r)).toEqual({});
  });

  test('tierMatches null (variable missing) is safe', () => {
    const r = cartLinesDiscountsGenerateRun(
      input({ own: [{ brand_tag: 'brand-b', percentage: 5 }], tierMatches: null, cfg: config({ tiers: [gold] }) })
    );
    expect(applied(r)).toEqual({ 1: 5 });
  });

  test('invalid percentages in a tier are skipped', () => {
    const bad = { tag: 'Gold', discounts: [{ brand_tag: 'brand-a', percentage: 150 }, { brand_tag: 'brand-b', percentage: -5 }] };
    const r = cartLinesDiscountsGenerateRun(
      input({ own: undefined, tierMatches: [{ tag: 'Gold', hasTag: true }], cfg: config({ tiers: [bad] }) })
    );
    expect(applied(r)).toEqual({});
  });

  test('malformed config JSON → no tiers, no crash', () => {
    const i = input({ own: [{ brand_tag: 'brand-a', percentage: 20 }], tierMatches: [{ tag: 'Gold', hasTag: true }] });
    i.discount.brandConfig = { value: '{not json' };
    expect(applied(cartLinesDiscountsGenerateRun(i))).toEqual({ 0: 20 });
  });

  test('product in both brands gets the better of the two', () => {
    const r = cartLinesDiscountsGenerateRun(
      input({
        own: undefined,
        tierMatches: [{ tag: 'Gold', hasTag: true }],
        cfg: config({ tiers: [gold] }),
        lines: [['brand-a', 'brand-b']],
      })
    );
    expect(applied(r)).toEqual({ 0: 25 });
  });
});
