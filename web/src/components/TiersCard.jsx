import { useCallback, useEffect, useState } from 'react';
import {
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  ButtonGroup,
  Badge,
  Banner,
  Modal,
  Box,
  Divider,
} from '@shopify/polaris';
import { loadTiers, syncTiers } from '../api/brandList';
import TierModal from './TierModal';

/**
 * "Discounts by customer tag" (Premium) on the Brands page: tiers that give
 * every customer with a Shopify tag the same brand discounts.
 *
 * On the free plan it explains the feature and offers the upgrade; tiers
 * saved earlier stay listed (read-only) but don't apply at checkout.
 *
 * @param {object}   props
 * @param {Array}    props.brands        registered brands
 * @param {boolean}  props.enabled       tiers apply on this plan
 * @param {boolean}  props.billed        public app (show the Premium badge)
 * @param {Function} props.onUpgrade     opens Shopify's plan page
 * @param {Function} props.onToast       (message) => void
 */
export default function TiersCard({ brands, enabled, billed, onUpgrade, onToast }) {
  const [tiers, setTiers] = useState(null); // null while loading
  const [loadError, setLoadError] = useState(null);
  const [editing, setEditing] = useState(null); // { tier?: Tier } | null
  const [deleting, setDeleting] = useState(null); // Tier | null
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    loadTiers()
      .then(setTiers)
      .catch((err) => {
        setLoadError(err);
        setTiers([]);
      });
  }, []);

  const save = useCallback(
    async (next) => {
      const original = editing?.tier;
      const list = original
        ? tiers.map((t) => (t === original ? next : t))
        : [...tiers, next];
      const saved = await syncTiers(list);
      setTiers(saved);
      setEditing(null);
      onToast?.(`Tier "${next.tag}" saved`);
    },
    [editing, tiers, onToast]
  );

  const confirmDelete = useCallback(async () => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const saved = await syncTiers(tiers.filter((t) => t !== deleting));
      setTiers(saved);
      onToast?.(`Tier "${deleting.tag}" deleted`);
      setDeleting(null);
    } catch (err) {
      setDeleteError(err);
    } finally {
      setDeleteBusy(false);
    }
  }, [tiers, deleting, onToast]);

  const brandName = (tag) => brands.find((b) => b.tag === tag)?.display_name;
  const describe = (tier) =>
    tier.discounts
      .filter((d) => brandName(d.brand_tag))
      .map((d) => `${brandName(d.brand_tag)} ${d.percentage}%`)
      .join(' · ') || 'No brands (they were deleted)';

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center" gap="200">
          <InlineStack gap="200" blockAlign="center">
            <Text as="h2" variant="headingMd">
              Discounts by customer tag
            </Text>
            {billed && <Badge tone={enabled ? 'success' : 'info'}>Premium</Badge>}
          </InlineStack>
          {enabled && (
            <Button
              onClick={() => setEditing({})}
              disabled={tiers === null || brands.length === 0}
            >
              Add tier
            </Button>
          )}
        </InlineStack>

        <Text as="p" tone="subdued">
          Give every customer with a Shopify tag the same brand discounts. For
          example, everyone tagged gold-dealer gets 25% on one brand and 15% on
          another. A discount set on a customer's own page takes priority for
          that brand.
        </Text>

        {loadError && (
          <Banner tone="critical" title="Couldn't load tiers">
            <p>{loadError.message}</p>
          </Banner>
        )}

        {!enabled && (
          <InlineStack gap="300" blockAlign="center">
            <Button variant="primary" onClick={onUpgrade}>
              Upgrade to Premium
            </Button>
            <Text as="span" tone="subdued">
              {tiers?.length
                ? "Your saved tiers don't apply on the free plan."
                : 'Available on Premium.'}
            </Text>
          </InlineStack>
        )}

        {enabled && tiers?.length === 0 && brands.length === 0 && (
          <Text as="p" tone="subdued">
            Add a brand first, then create a tier.
          </Text>
        )}

        {tiers?.length > 0 && (
          <BlockStack gap="300">
            <Divider />
            {tiers.map((tier) => (
              <InlineStack key={tier.tag} align="space-between" blockAlign="center" gap="200">
                <BlockStack gap="050">
                  <Text as="span" fontWeight="semibold">
                    {tier.tag}
                  </Text>
                  <Text as="span" tone="subdued">
                    {describe(tier)}
                  </Text>
                </BlockStack>
                {enabled && (
                  <ButtonGroup>
                    <Button onClick={() => setEditing({ tier })}>Edit</Button>
                    <Button tone="critical" onClick={() => setDeleting(tier)}>
                      Delete
                    </Button>
                  </ButtonGroup>
                )}
              </InlineStack>
            ))}
          </BlockStack>
        )}
      </BlockStack>

      <TierModal
        open={editing !== null}
        tier={editing?.tier}
        brands={brands}
        otherTiers={(tiers ?? []).filter((t) => t !== editing?.tier)}
        onClose={() => setEditing(null)}
        onSave={save}
      />

      <Modal
        open={deleting !== null}
        onClose={deleteBusy ? undefined : () => setDeleting(null)}
        title={`Delete tier "${deleting?.tag ?? ''}"?`}
        primaryAction={{
          content: 'Delete tier',
          destructive: true,
          onAction: confirmDelete,
          loading: deleteBusy,
        }}
        secondaryActions={[
          { content: 'Cancel', onAction: () => setDeleting(null), disabled: deleteBusy },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            {deleteError && (
              <Banner tone="critical">
                <p>{deleteError.message}</p>
              </Banner>
            )}
            <Box>
              <Text as="p">
                Customers tagged {deleting?.tag} will stop getting these discounts
                at checkout. Their customer tags and any discounts set on their
                own pages stay as they are.
              </Text>
            </Box>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Card>
  );
}
