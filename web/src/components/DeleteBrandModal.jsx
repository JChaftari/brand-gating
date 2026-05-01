import { useEffect, useState } from 'react';
import { Modal, Banner, BlockStack, Text } from '@shopify/polaris';

/**
 * Delete brand confirmation modal.
 *
 * Behavior:
 *   - Removes the brand from `custom.brand_list` only.
 *   - Does NOT delete the underlying collection or untag products. Those are
 *     intentional, separate destructive actions the merchant performs in
 *     Shopify admin if they want them.
 *   - Customers with this brand in their `brand_discounts` metafield will
 *     stop receiving the discount at checkout (the function's input_variables
 *     no longer includes the tag, so cart lines never match it).
 *
 * Note: A "this affects N customers" count was considered but skipped — there
 * is no efficient server-side filter for a metafield-JSON-contains-string
 * query, so it would require iterating the entire customer list.
 */
export default function DeleteBrandModal({ open, brand, onClose, onConfirm }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!brand) return;
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm(brand);
      // Parent closes modal + shows success toast on resolve.
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!brand) return null;

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title={`Delete brand "${brand.display_name}"?`}
      primaryAction={{
        content: 'Delete brand',
        onAction: handleConfirm,
        loading: submitting,
        destructive: true,
      }}
      secondaryActions={[
        { content: 'Cancel', onAction: onClose, disabled: submitting },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="300">
          {error && (
            <Banner tone="critical" title="Could not delete brand" onDismiss={() => setError(null)}>
              <p>{error.message}</p>
            </Banner>
          )}
          <Text as="p" variant="bodyMd">
            This will <Text as="span" fontWeight="semibold">not</Text> delete the
            "{brand.display_name}" collection or untag any products.
          </Text>
          <Text as="p" variant="bodyMd">
            Customers with discounts assigned to this brand will no longer
            receive them at checkout.
          </Text>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
