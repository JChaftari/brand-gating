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
  Link,
  Box,
} from '@shopify/polaris';
import { createBrandCollection, updateCollection } from '../api/collection';

/**
 * Add brand modal. Self-contained flow:
 *   1. Validate (display name + tag, tag uniqueness, image URL shape).
 *   2. collectionCreate.
 *   3. If image URL provided: collectionUpdate to attach.
 *   4. Persist via onSubmit (parent calls syncBrandList with appended brand).
 *
 * Image handling — known limitation:
 *   App Bridge's resourcePicker only supports product/variant/collection
 *   types as of 2026-01; there is no public file/media picker
 *   (see https://github.com/Shopify/shopify-app-bridge/issues/266 — still
 *   open). For now, the merchant uploads to Shopify Files (admin → Content →
 *   Files), copies the CDN URL, and pastes it here. Revisit when Shopify
 *   ships an official file picker.
 *
 * Failure modes:
 *   - Pre-collection failure (validation, network, etc.): inline error banner,
 *     modal stays open, user can retry.
 *   - Post-collection failure (image attach OR registry sync after collection
 *     was created): "orphan collection" banner with manual cleanup
 *     instructions. Add button is disabled to prevent retrying as-is, since
 *     a retry would create a duplicate collection.
 */
export default function AddBrandModal({ open, onClose, existingBrands, onSubmit }) {
  const [displayName, setDisplayName] = useState('');
  const [tag, setTag] = useState('');
  const [tagManuallyEdited, setTagManuallyEdited] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [orphanWarning, setOrphanWarning] = useState(null);

  // Auto-derive tag from display name unless the user has typed in the tag
  // field directly. Once they edit it manually, we stop overwriting.
  useEffect(() => {
    if (tagManuallyEdited) return;
    setTag(deriveTag(displayName));
  }, [displayName, tagManuallyEdited]);

  // Reset everything when modal closes (so reopening starts clean).
  useEffect(() => {
    if (!open) {
      setDisplayName('');
      setTag('');
      setTagManuallyEdited(false);
      setImageUrl('');
      setSubmitting(false);
      setError(null);
      setOrphanWarning(null);
    }
  }, [open]);

  const validation = useMemo(
    () => validate(displayName, tag, imageUrl, existingBrands),
    [displayName, tag, imageUrl, existingBrands]
  );

  const canSubmit = !submitting && !orphanWarning && validation === null;

  const handleTagChange = (val) => {
    setTagManuallyEdited(true);
    setTag(val);
  };

  const handleSubmit = async () => {
    setError(null);
    setOrphanWarning(null);

    if (validation !== null) {
      setError(new Error(validation));
      return;
    }

    setSubmitting(true);
    let collection = null;
    const trimmedUrl = imageUrl.trim();

    try {
      // Step 1 — create the collection.
      collection = await createBrandCollection({
        title: displayName.trim(),
        handle: tag,
      });

      // Step 2 — attach image if provided.
      if (trimmedUrl) {
        await updateCollection({
          collectionId: collection.id,
          imageUrl: trimmedUrl,
          altText: displayName.trim(),
        });
      }

      // Step 3 — persist registry. Parent handles syncBrandList.
      await onSubmit({
        tag,
        display_name: displayName.trim(),
        collection_id: collection.id,
        image_url: trimmedUrl || null,
      });
      // Parent closes the modal + shows success toast on resolve.
    } catch (err) {
      if (collection) {
        setOrphanWarning({ collection, error: err });
      } else {
        setError(err);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title="Add brand"
      primaryAction={{
        content: 'Add brand',
        onAction: handleSubmit,
        loading: submitting,
        disabled: !canSubmit,
      }}
      secondaryActions={[
        {
          content: 'Cancel',
          onAction: onClose,
          disabled: submitting,
        },
      ]}
    >
      <Modal.Section>
        <BlockStack gap="400">
          {error && (
            <Banner tone="critical" title="Could not add brand" onDismiss={() => setError(null)}>
              <p>{error.message}</p>
            </Banner>
          )}

          {orphanWarning && <OrphanCollectionBanner orphan={orphanWarning} />}

          <FormLayout>
            <TextField
              label="Display name"
              value={displayName}
              onChange={setDisplayName}
              autoComplete="off"
              requiredIndicator
              disabled={submitting || !!orphanWarning}
              helpText="Shown to merchants in admin. Example: 'Brand Delta'."
            />

            <TextField
              label="Brand tag"
              value={tag}
              onChange={handleTagChange}
              autoComplete="off"
              requiredIndicator
              disabled={submitting || !!orphanWarning}
              helpText="Lowercase, hyphens only. Auto-generated from the display name. Used as the product tag and collection handle."
              error={
                validation && tag.length > 0 && /tag/i.test(validation)
                  ? validation
                  : undefined
              }
            />

            <BrandImageUrlField
              value={imageUrl}
              onChange={setImageUrl}
              disabled={submitting || !!orphanWarning}
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
            Paste a URL from Shopify Files. Upload first via admin → Content →
            Files, then click the image and copy the URL. (A built-in file
            picker isn't available yet — Shopify hasn't shipped one for
            embedded apps.)
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

function OrphanCollectionBanner({ orphan }) {
  const { collection, error } = orphan;
  const numericId = collection?.id?.match?.(/Collection\/(\d+)$/)?.[1] ?? null;
  return (
    <Banner tone="critical" title="Brand was partially created — manual cleanup required">
      <BlockStack gap="200">
        <Text as="p" variant="bodyMd">
          The collection "{collection.title}" (handle: <code>{collection.handle}</code>) was
          created, but the next step failed and the brand registry was not updated.
          {' '}Retrying as-is would create a duplicate collection.
        </Text>
        <Text as="p" variant="bodyMd">
          Please {numericId ? (
            <Link url={`shopify:admin/collections/${numericId}`}>open the orphaned collection</Link>
          ) : 'open the orphaned collection in admin'} and delete it, then close this dialog and
          try adding the brand again.
        </Text>
        <Text as="p" tone="subdued" variant="bodySm">
          Underlying error: {error?.message || 'Unknown'}
        </Text>
      </BlockStack>
    </Banner>
  );
}

// ---------- helpers ---------------------------------------------------------

/**
 * Display name → brand tag (lowercase, hyphenated, alphanumeric).
 *   "Brand Delta"     → "brand-delta"
 *   "  Acme & Co.  "  → "acme-co"
 */
export function deriveTag(displayName) {
  return String(displayName || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]+/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function validate(displayName, tag, imageUrl, existingBrands) {
  if (!displayName.trim()) return 'Display name is required.';
  if (!tag.trim()) return 'Brand tag is required.';
  if (!/^[a-z0-9][a-z0-9-]*$/.test(tag)) {
    return 'Brand tag must be lowercase alphanumeric with hyphens (no leading hyphen).';
  }
  if (existingBrands.some((b) => b.tag === tag)) {
    return `A brand with tag "${tag}" already exists.`;
  }
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
