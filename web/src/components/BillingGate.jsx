import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Banner,
  Spinner,
  Box,
} from '@shopify/polaris';
import { loadBillingStatus } from '../api/billing';
import {
  pauseBrandDiscounts,
  resumeBrandDiscounts,
  setBrandLimit,
  setTiersEnabled,
} from '../api/brandList';

/**
 * Plan gate for the public (App Store) app.
 *
 * - No active plan: shows a "choose a plan" screen instead of the app and
 *   switches the store's brand discounts off, so they stop at checkout.
 * - Active plan: switches back on any discounts it paused, sets the plan's
 *   brand limit (free plan: the first FREE_PLAN_BRAND_LIMIT brands), then
 *   shows the app.
 * - App not billed (the customer's custom app): shows the app straight away,
 *   with no brand limit.
 *
 * Discounts are only switched off when the store is known to have no plan —
 * never when the check itself fails.
 */

// The store's plan, for pages:
//   planUrl:    Shopify's plan page for this store, or null when the app
//               isn't billed. Lets pages offer "Manage plan" in-app.
//   free:       the store is on the free plan
//   brandLimit: brands that get discounts at checkout (Infinity = no limit)
//   tiersEnabled: customer-tag tiers apply at checkout (not on the free plan)
const NO_PLAN = { planUrl: null, free: false, brandLimit: Infinity, tiersEnabled: true };
const PlanContext = createContext(NO_PLAN);
export const usePlan = () => useContext(PlanContext);
export const usePlanUrl = () => useContext(PlanContext).planUrl;

export default function BillingGate({ children }) {
  const [state, setState] = useState({ status: 'checking' });

  const check = useCallback(async () => {
    setState({ status: 'checking' });
    let billing;
    try {
      billing = await loadBillingStatus();
    } catch (err) {
      setState({ status: 'error', error: err });
      return;
    }

    if (!billing.required) {
      setBrandLimit(Infinity);
      setTiersEnabled(true);
      setState({ status: 'ok', plan: NO_PLAN });
      return;
    }

    if (billing.active) {
      // Set before the app renders: the Brands page's first load self-heals
      // the discounts' brand lists against this limit.
      setBrandLimit(billing.brandLimit);
      setTiersEnabled(!billing.free);
      const plan = {
        planUrl: billing.planUrl,
        free: billing.free,
        brandLimit: billing.brandLimit,
        tiersEnabled: !billing.free,
      };
      try {
        await resumeBrandDiscounts();
        setState({ status: 'ok', plan });
      } catch (err) {
        // Merchant with a plan: never block the app over this; just say so.
        setState({ status: 'ok', plan, resumeError: err });
      }
      return;
    }

    let paused = 0;
    let pauseError = null;
    try {
      paused = await pauseBrandDiscounts();
    } catch (err) {
      pauseError = err;
    }
    setState({ status: 'locked', planUrl: billing.planUrl, paused, pauseError });
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  if (state.status === 'ok') {
    return (
      <PlanContext.Provider value={state.plan}>
        {state.resumeError && (
          <Box padding="400">
            <Banner tone="warning" title="Some brand discounts couldn't be switched back on">
              <p>
                Check Discounts in your Shopify admin and turn them on there.
                ({state.resumeError.message})
              </p>
            </Banner>
          </Box>
        )}
        {children}
      </PlanContext.Provider>
    );
  }

  if (state.status === 'checking') {
    return (
      <Page>
        <InlineStack align="center" blockAlign="center" gap="200">
          <Spinner size="small" accessibilityLabel="Checking your plan" />
          <Text as="span" tone="subdued">Checking your plan…</Text>
        </InlineStack>
      </Page>
    );
  }

  if (state.status === 'error') {
    return (
      <Page title="Vendtier">
        <Banner
          tone="critical"
          title="Couldn't check your plan"
          action={{ content: 'Try again', onAction: check }}
        >
          <p>{state.error.message}</p>
        </Banner>
      </Page>
    );
  }

  // locked
  return (
    <Page title="Vendtier">
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            Choose a plan to use Vendtier
          </Text>
          <Text as="p">
            Vendtier needs an active plan. Pick one to set up your brands and
            give customers their brand discounts. The free plan covers up to
            two brands.
          </Text>
          {state.paused > 0 && (
            <Text as="p" tone="subdued">
              Brand discounts at checkout are switched off until a plan is
              active. They switch back on when you return here with a plan.
            </Text>
          )}
          {state.pauseError && (
            <Text as="p" tone="critical">
              Some brand discounts couldn't be switched off: {state.pauseError.message}
            </Text>
          )}
          <InlineStack>
            <Button variant="primary" onClick={() => window.open(state.planUrl, '_top')}>
              Choose a plan
            </Button>
          </InlineStack>
        </BlockStack>
      </Card>
    </Page>
  );
}
