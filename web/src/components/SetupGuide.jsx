import { useCallback, useEffect, useState } from 'react';
import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  ProgressBar,
  Icon,
  Box,
} from '@shopify/polaris';
import { CheckCircleIcon } from '@shopify/polaris-icons';
import { loadSetupProgress, hideSetupGuide } from '../api/setup';

/**
 * Setup guide on the Brands page: four steps from install to a working
 * brand discount, each ticked off as the store completes it (progress from
 * api/setup.js plus the page's own discountCount and brands). The next step
 * is expanded with its action; done steps collapse. Disappears once every
 * step is done, or when the merchant hides it.
 *
 * @param {object}   props
 * @param {Array}    props.brands         the registry (useBrandList)
 * @param {number}   props.discountCount  brand discounts on the store
 * @param {Function} props.onActivate     creates the brand discount
 * @param {boolean}  props.activating
 * @param {Error}    [props.activateError]
 * @param {Function} props.onAddBrand     opens the Add brand modal
 * @param {Function} props.onVisibleChange  told whether the guide is showing
 *   (null while loading), so the page can show its own "Brand discounts are
 *   off" banner instead
 */
export default function SetupGuide({
  brands,
  discountCount,
  onActivate,
  activating,
  activateError,
  onAddBrand,
  onVisibleChange,
}) {
  const [progress, setProgress] = useState(null); // null while loading
  const [hiding, setHiding] = useState(false);

  // Reload when the brand list changes (a new brand, or products assigned
  // elsewhere and the merchant comes back to the page).
  useEffect(() => {
    let cancelled = false;
    loadSetupProgress(brands)
      .then((p) => !cancelled && setProgress(p))
      .catch((err) => {
        // Never block the page over the guide: show it with unknown steps open.
        console.warn('Setup progress unavailable:', err);
        if (!cancelled) setProgress({ productsAssigned: false, customerDiscountSet: false, hidden: false });
      });
    return () => {
      cancelled = true;
    };
  }, [brands]);

  const firstBrand = brands[0];
  const collectionId = firstBrand?.collection_id?.match(/Collection\/(\d+)$/)?.[1];

  const steps = [
    {
      title: 'Turn on brand discounts',
      done: discountCount > 0,
      body: "Creates the automatic discount that applies each customer's brand percentages at checkout.",
      action: (
        <Button variant="primary" onClick={onActivate} loading={activating} disabled={activating}>
          Turn on brand discounts
        </Button>
      ),
      error: activateError && `Couldn't turn on brand discounts: ${activateError.message}`,
    },
    {
      title: 'Add a brand',
      done: brands.length > 0,
      body: 'Register a brand you sell. Vendtier creates a collection for it.',
      action: (
        <Button variant="primary" onClick={onAddBrand}>
          Add brand
        </Button>
      ),
    },
    {
      title: 'Add products to a brand',
      done: !!progress?.productsAssigned,
      body: firstBrand
        ? `Add products to the ${firstBrand.display_name} collection, or tag them ${firstBrand.tag}. Either one makes them part of the brand.`
        : "Add products to the brand's collection, or tag them with the brand's tag.",
      action: collectionId ? (
        <Button variant="primary" url={`shopify:admin/collections/${collectionId}`}>
          {`Open ${firstBrand.display_name} collection`}
        </Button>
      ) : (
        <Button variant="primary" url="shopify:admin/products">
          Open products
        </Button>
      ),
    },
    {
      title: 'Give a customer their brand discounts',
      done: !!progress?.customerDiscountSet,
      body:
        'Open a customer, click + Block, choose Customer Brand Discounts and pin it. ' +
        'Then add a brand and a percentage. It applies the next time they check out.',
      action: (
        <Button variant="primary" url="shopify:admin/customers">
          Go to customers
        </Button>
      ),
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const visible = progress !== null && !progress.hidden && !allDone;
  const nextIndex = steps.findIndex((s) => !s.done);

  // null until progress has loaded, so the page doesn't flash its own banner.
  const reported = progress === null ? null : visible;
  useEffect(() => {
    onVisibleChange?.(reported);
  }, [reported, onVisibleChange]);

  const hide = useCallback(async () => {
    setHiding(true);
    try {
      await hideSetupGuide();
      setProgress((p) => ({ ...p, hidden: true }));
    } catch (err) {
      console.warn("Couldn't hide the setup guide:", err);
      setHiding(false);
    }
  }, []);

  if (!visible) return null;

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text as="h2" variant="headingMd">
              Set up Vendtier
            </Text>
            <Text as="p" tone="subdued">
              About 5 minutes. {doneCount} of {steps.length} done.
            </Text>
          </BlockStack>
          <Button variant="tertiary" onClick={hide} loading={hiding}>
            Hide
          </Button>
        </InlineStack>

        <ProgressBar progress={(doneCount / steps.length) * 100} size="small" tone="success" />

        <BlockStack gap="300">
          {steps.map((step, i) => (
            <Step key={step.title} step={step} expanded={i === nextIndex} />
          ))}
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

function Step({ step, expanded }) {
  return (
    <InlineStack gap="300" wrap={false} blockAlign="start">
      <Box minWidth="20px">
        {step.done ? (
          <Icon source={CheckCircleIcon} tone="success" accessibilityLabel="Done" />
        ) : (
          <Box
            borderWidth="050"
            borderColor="border"
            borderRadius="full"
            minWidth="20px"
            minHeight="20px"
          />
        )}
      </Box>
      <BlockStack gap="200">
        <Text as="h3" variant="bodyMd" fontWeight={expanded ? 'semibold' : 'regular'} tone={step.done ? 'subdued' : undefined}>
          {step.title}
        </Text>
        {expanded && (
          <>
            <Text as="p" tone="subdued">
              {step.body}
            </Text>
            <InlineStack>{step.action}</InlineStack>
            {step.error && (
              <Text as="p" tone="critical">
                {step.error}
              </Text>
            )}
          </>
        )}
      </BlockStack>
    </InlineStack>
  );
}
