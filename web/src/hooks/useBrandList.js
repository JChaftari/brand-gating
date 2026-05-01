import { useCallback, useEffect, useState } from 'react';
import { loadBrandList, syncBrandList, selfHealBrandRegistry } from '../api/brandList';

/**
 * React hook over the brand registry. On mount: runs the self-healing check
 * (which silently re-syncs any discount whose input_variables drifted), then
 * loads the canonical brand list. Exposes:
 *
 *   brands            current normalized list
 *   loading           true during initial load + during refresh
 *   error             last load error
 *   discountCount     # of automatic discounts using brand-discount; null
 *                     until first load completes. 0 → caller should warn the
 *                     merchant that updates won't take effect at checkout.
 *   refresh()         re-runs self-heal + load
 *   replace(next)     persists `next` via syncBrandList, updates local state
 */
export function useBrandList() {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [discountCount, setDiscountCount] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Self-heal first. If drift was detected this also re-writes both the
      // shop brand_list and every discount's input_variables atomically. The
      // subsequent loadBrandList then sees the up-to-date canonical state.
      const heal = await selfHealBrandRegistry();
      setDiscountCount(heal.discountCount);

      const list = await loadBrandList();
      setBrands(list);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Atomic replace via the centralized helper — see brandList.js docblock for
  // the invariant this preserves.
  const replace = useCallback(async (nextList) => {
    const { brands: persisted, syncedDiscountCount } = await syncBrandList(nextList);
    setBrands(persisted);
    setDiscountCount(syncedDiscountCount);
    return persisted;
  }, []);

  return { brands, loading, error, discountCount, refresh, replace };
}
