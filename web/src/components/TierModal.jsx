import { useEffect, useState } from 'react';
import { Modal, Banner, BlockStack, TextField, Text, FormLayout } from '@shopify/polaris';
import { validateTiers } from '../api/brandList';

/**
 * Add or edit a customer-tag tier: a Shopify customer tag plus a percentage
 * for any of the registered brands (blank = no tier discount on that brand).
 *
 * @param {object}   props
 * @param {boolean}  props.open
 * @param {object}   [props.tier]      the tier being edited; omit to add
 * @param {Array}    props.brands      registered brands, for the percentage rows
 * @param {Array}    props.otherTiers  the other tiers, to catch duplicate tags
 * @param {Function} props.onClose
 * @param {Function} props.onSave      (tier) => Promise; parent persists it
 */
export default function TierModal({ open, tier, brands, otherTiers, onClose, onSave }) {
  const [tag, setTag] = useState('');
  const [percentages, setPercentages] = useState({}); // brand_tag → string
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setTag(tier?.tag ?? '');
    const initial = {};
    for (const d of tier?.discounts ?? []) initial[d.brand_tag] = String(d.percentage);
    setPercentages(initial);
    setError(null);
    setSaving(false);
  }, [open, tier]);

  const handleSave = async () => {
    const next = {
      tag: tag.trim(),
      discounts: brands
        .filter((b) => (percentages[b.tag] ?? '').trim() !== '')
        .map((b) => ({ brand_tag: b.tag, percentage: Number(percentages[b.tag]) })),
    };
    try {
      validateTiers([...otherTiers, next]);
    } catch (err) {
      setError(err);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title={tier ? `Edit tier "${tier.tag}"` : 'Add a customer tier'}
      primaryAction={{ content: 'Save tier', onAction: handleSave, loading: saving }}
      secondaryActions={[{ content: 'Cancel', onAction: onClose, disabled: saving }]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {error && (
            <Banner tone="critical" onDismiss={() => setError(null)}>
              <p>{error.message}</p>
            </Banner>
          )}
          <FormLayout>
            <TextField
              label="Customer tag"
              value={tag}
              onChange={setTag}
              autoComplete="off"
              placeholder="gold-dealer"
              helpText="Every customer with this tag gets the discounts below. Add the tag to customers in Shopify (Customers → a customer → Tags). Not case-sensitive."
            />
          </FormLayout>
          <BlockStack gap="200">
            <Text as="h3" variant="headingSm">
              Discount on each brand
            </Text>
            <Text as="p" tone="subdued">
              Leave a brand blank for no tier discount on it. A discount set on a
              customer's own page takes priority for that brand.
            </Text>
          </BlockStack>
          <FormLayout>
            {brands.map((b) => (
              <TextField
                key={b.tag}
                label={b.display_name}
                type="number"
                min={0}
                max={100}
                suffix="%"
                value={percentages[b.tag] ?? ''}
                onChange={(v) => setPercentages((p) => ({ ...p, [b.tag]: v }))}
                autoComplete="off"
                placeholder="No discount"
              />
            ))}
          </FormLayout>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
