import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  FormLayout,
  TextField,
  Thumbnail,
  Banner,
  BlockStack,
  InlineStack,
  Text,
  Tooltip,
  Icon,
} from '@shopify/polaris';
import { InfoIcon } from '@shopify/polaris-icons';
import { updateCollection } from '../api/collection';

/**
 * Edit brand modal. Pre-populates from `brand`, allows editing display name
 * and image URL. Tag is read-only with a tooltip explaining why (changing
 * tags would orphan tagged products and customer JSON references).
 *
 * On submit:
 *   1. If display_name and/or image_url changed → updateCollection (single
 *      mutation handles title/image/clear-image atomically).
 *   2. onSubmit(updatedBrand) — parent does syncBrandList with the updated
 *      registry. Tag list is unchanged (since the tag is immutable), so the
 *      function-facing input_variables write is effectively a no-op for
 *      brand-list edits.
 *
 * Errors stay in the modal — never silently close on failure.
 */
export default function EditBrandModal({ open, brand, onClose, onSubmit }) {
  const [displayName, setDisplayName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Re-populate the form whenever a different brand is opened. Also reset
  // submitting/error state.
  useEffect(() => {
    if (!open || !brand) return;
    setDisplayName(brand.display_name ?? '');
    setImageUrl(brand.image_url ?? '');
    setSubmitting(false);
    setError(null);
  }, [open, brand]);

  const validation = useMemo(
    () => validate(displayName, imageUrl),
    [displayName, imageUrl]
  );

  const isDirty = useMemo(() => {
    if (!brand) return false;
    return (
      displayName.trim() !== (brand.display_name ?? '') ||
      (imageUrl.trim() || null) !== (brand.image_url || null)
    );
  }, [brand, displayName, imageUrl]);

  const canSubmit = !submitting && validation === null && isDirty;

  const handleSubmit = async () => {
    setError(null);
    if (!brand) return;

    if (validation !== null) {
      setError(new Error(validation));
      return;
    }

    setSubmitting(true);

    const trimmedName = displayName.trim();
    const trimmedUrl = imageUrl.trim();
    const titleChanged = trimmedName !== (brand.display_name ?? '');
    const imageChanged = (trimmedUrl || null) !== (brand.image_url || null);

    try {
      // Step 1 — update the underlying collection if title and/or image changed.
      if (titleChanged || imageChanged) {
        await updateCollection({
          collectionId: brand.collection_id,
          ...(titleChanged ? { title: trimmedName } : {}),
          ...(imageChanged ? { imageUrl: trimmedUrl || null } : {}),
          altText: trimmedName,
        });
      }

      // Step 2 — persist registry. Parent handles syncBrandList.
      await onSubmit({
        ...brand,
        display_name: trimmedName,
        image_url: trimmedUrl || null,
      });
      // Parent closes modal + shows success toast.
    } catch (err) {
      // Whether the failure was at collectionUpdate or syncBrandList, staying
      // in the modal lets the merchant retry. updateCollection is idempotent
      // (same input → same result), so retry is safe.
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
      title={`Edit brand "${brand.display_name}"`}
      primaryAction={{
        content: 'Save changes',
        onAction: handleSubmit,
        loading: submitting,
        disabled: !canSubmit,
      }}
      secondaryActions={[
        { content: 'Cancel', onAction: onClose, disabled: submitting },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {error && (
            <Banner tone="critical" title="Could not save changes" onDismiss={() => setError(null)}>
              <p>{error.message}</p>
            </Banner>
          )}

          <FormLayout>
            <TextField
              label="Display name"
              value={displayName}
              onChange={setDisplayName}
              autoComplete="off"
              requiredIndicator
              disabled={submitting}
              helpText="Updating this also updates the underlying collection's title."
            />

            <ReadOnlyTagField tag={brand.tag} />

            <BrandImageUrlField
              value={imageUrl}
              onChange={setImageUrl}
              disabled={submitting}
              error={
                validation && imageUrl.length > 0 && /image url/i.test(validation)
                  ? validation
                  : undefined
              }
            />
          </FormLayout>
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}

// ---------- subcomponents ---------------------------------------------------

function ReadOnlyTagField({ tag }) {
  const labelWithTooltip = (
    <InlineStack gap="100" blockAlign="center">
      <Text as="span" variant="bodyMd">Brand tag</Text>
      <Tooltip content="Brand tags cannot be changed after creation. Delete and re-create the brand if you need a different tag.">
        <span style={{ display: 'inline-flex', cursor: 'help' }}>
          <Icon source={InfoIcon} tone="subdued" />
        </span>
      </Tooltip>
    </InlineStack>
  );
  return (
    <TextField
      label={labelWithTooltip}
      value={tag}
      disabled
      autoComplete="off"
    />
  );
}

function BrandImageUrlField({ value, onChange, disabled, error }) {
  const showPreview = !!value && !error;
  return (
    <BlockStack gap="200">
      <TextField
        label="Brand image URL (optional)"
        value={value}
        onChange={onChange}
        autoComplete="off"
        disabled={disabled}
        placeholder="https://cdn.shopify.com/s/files/..."
        helpText={
          <>
            Paste a URL from Shopify Files, or clear to remove the brand image.
            Upload via admin → Content → Files, then click the image and copy
            the URL.
          </>
        }
        error={error}
      />
      {showPreview && (
        <InlineStack gap="200" blockAlign="center">
          <Thumbnail source={value} alt="Brand image preview" size="medium" />
          <Text as="span" tone="subdued" variant="bodySm">Preview</Text>
        </InlineStack>
      )}
    </BlockStack>
  );
}

// ---------- helpers ---------------------------------------------------------

function validate(displayName, imageUrl) {
  if (!displayName.trim()) return 'Display name is required.';
  if (imageUrl.trim() && !isLikelyHttpUrl(imageUrl.trim())) {
    return 'Image URL must be a valid http(s) URL.';
  }
  return null;
}

function isLikelyHttpUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
