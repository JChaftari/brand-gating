import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Page,
  Card,
  IndexTable,
  Thumbnail,
  Link,
  Button,
  ButtonGroup,
  Text,
  Banner,
  Spinner,
  BlockStack,
  InlineStack,
  Box,
  Toast,
  Badge,
} from '@shopify/polaris';
import { useBrandList } from '../hooks/useBrandList';
import AddBrandModal from '../components/AddBrandModal';
import EditBrandModal from '../components/EditBrandModal';
import DeleteBrandModal from '../components/DeleteBrandModal';
import SetupGuide from '../components/SetupGuide';
import { usePlan } from '../components/BillingGate';
import { maybeRequestReview } from '../api/reviews';

// Wait this long after the page has loaded before asking for a review, so the
// modal doesn't appear while the merchant is still orienting.
const REVIEW_REQUEST_DELAY_MS = 3000;

export default function BrandsPage() {
  const { brands, loading, error, discountCount, replace, createDiscount } = useBrandList();
  // planUrl is null for the customer's custom app (not billed). On the free
  // plan only the first brandLimit brands get discounts at checkout.
  const { planUrl, free, brandLimit } = usePlan();
  const atLimit = brands.length >= brandLimit;
  const openPlanPage = useCallback(() => window.open(planUrl, '_top'), [planUrl]);

  // App Store review request: once per page visit, after brands have loaded,
  // public app only. maybeRequestReview decides whether the store qualifies
  // (brand discounts used on an order, not asked in the last 60 days).
  // The flag is set when the timer fires, not when it's scheduled, so
  // StrictMode's double effect run (dev) doesn't cancel the only request.
  const reviewAsked = useRef(false);
  useEffect(() => {
    if (loading || !planUrl || reviewAsked.current) return undefined;
    const timer = setTimeout(() => {
      reviewAsked.current = true;
      maybeRequestReview();
    }, REVIEW_REQUEST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loading, planUrl]);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);   // brand|null
  const [deleteTarget, setDeleteTarget] = useState(null); // brand|null
  const [toast, setToast] = useState(null);
  const [postAddBanner, setPostAddBanner] = useState(null);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState(null);
  // While the setup guide shows, its first step replaces the "Brand discounts
  // are off" banner.
  // null while the guide loads.
  const [guideVisible, setGuideVisible] = useState(null);

  // Create the store's brand discount. Shopify's discount-type picker sends
  // merchants who choose this app's discount here, so this is the only way a
  // store gets one.
  const handleActivateDiscount = useCallback(async () => {
    setActivating(true);
    setActivateError(null);
    try {
      await createDiscount();
      setToast('Brand discounts turned on');
    } catch (err) {
      setActivateError(err);
    } finally {
      setActivating(false);
    }
  }, [createDiscount]);

  const openAddModal = useCallback(() => setAddModalOpen(true), []);
  const closeAddModal = useCallback(() => setAddModalOpen(false), []);

  const openEditModal = useCallback((brand) => setEditTarget(brand), []);
  const closeEditModal = useCallback(() => setEditTarget(null), []);

  const openDeleteModal = useCallback((brand) => setDeleteTarget(brand), []);
  const closeDeleteModal = useCallback(() => setDeleteTarget(null), []);

  // Add — append the new brand to the list, persist atomically.
  const handleAddBrandSubmit = useCallback(
    async (newBrand) => {
      const next = [...brands, newBrand];
      await replace(next); // throws on syncBrandList failure
      setAddModalOpen(false);
      setToast(`Brand "${newBrand.display_name}" added`);
      setPostAddBanner({
        display_name: newBrand.display_name,
        tag: newBrand.tag,
      });
    },
    [brands, replace]
  );

  // Edit — replace the matching entry in place. Tag is immutable so we match
  // on tag for safety against any state-ordering surprises.
  const handleEditBrandSubmit = useCallback(
    async (updatedBrand) => {
      const next = brands.map((b) =>
        b.tag === updatedBrand.tag ? updatedBrand : b
      );
      await replace(next);
      setEditTarget(null);
      setToast(`Brand "${updatedBrand.display_name}" updated`);
    },
    [brands, replace]
  );

  // Delete — remove the brand from the list. The collection and product tags
  // remain intentionally intact (per spec).
  const handleDeleteBrandConfirm = useCallback(
    async (brand) => {
      const next = brands.filter((b) => b.tag !== brand.tag);
      await replace(next);
      setDeleteTarget(null);
      setToast(`Brand "${brand.display_name}" deleted`);
    },
    [brands, replace]
  );

  return (
    <Page
      title="Brands"
      subtitle="Manage the brands available for customer discount assignment."
      primaryAction={
        atLimit && planUrl
          ? { content: 'Upgrade for more brands', onAction: openPlanPage }
          : { content: 'Add brand', onAction: openAddModal }
      }
      secondaryActions={
        planUrl ? [{ content: 'Manage plan', onAction: openPlanPage }] : undefined
      }
    >
      <BlockStack gap="400">
        {error && (
          <Banner tone="critical" title="Failed to load brands">
            <p>{error.message}</p>
          </Banner>
        )}

        {!loading && !error && (
          <SetupGuide
            brands={brands}
            discountCount={discountCount}
            onActivate={handleActivateDiscount}
            activating={activating}
            activateError={activateError}
            onAddBrand={openAddModal}
            onVisibleChange={setGuideVisible}
          />
        )}

        {!loading && discountCount === 0 && guideVisible === false && (
          <Banner
            tone="warning"
            title="Brand discounts are off"
            action={{
              content: 'Turn on brand discounts',
              onAction: handleActivateDiscount,
              loading: activating,
              disabled: activating,
            }}
          >
            <BlockStack gap="200">
              <p>
                Customers won't get their brand discounts at checkout until
                this is on. It creates an automatic discount that applies each
                customer's brand percentages to the products they buy.
              </p>
              {activateError && (
                <Text as="p" tone="critical">
                  Couldn't turn on brand discounts: {activateError.message}
                </Text>
              )}
            </BlockStack>
          </Banner>
        )}

        {!loading && discountCount > 0 && (
          // Merchants who pick this app in Discounts → Create discount land
          // here; tell them it's already working.
          <InlineStack gap="200" blockAlign="center">
            <Badge tone="success">On</Badge>
            <Text as="p" tone="subdued">
              Brand discounts are on — customers get their brand percentages
              at checkout.
            </Text>
          </InlineStack>
        )}

        {!loading && free && (
          <FreePlanNotice brands={brands} brandLimit={brandLimit} onUpgrade={openPlanPage} />
        )}

        {postAddBanner && (
          <PostAddBanner
            brand={postAddBanner}
            onDismiss={() => setPostAddBanner(null)}
          />
        )}

        {loading ? (
          <LoadingCard />
        ) : brands.length === 0 ? (
          <BrandsEmptyState onAddBrand={openAddModal} />
        ) : (
          <BrandsTable
            brands={brands}
            brandLimit={brandLimit}
            onEdit={openEditModal}
            onDelete={openDeleteModal}
          />
        )}
      </BlockStack>

      <AddBrandModal
        open={addModalOpen}
        onClose={closeAddModal}
        existingBrands={brands}
        onSubmit={handleAddBrandSubmit}
      />

      <EditBrandModal
        open={editTarget !== null}
        brand={editTarget}
        onClose={closeEditModal}
        onSubmit={handleEditBrandSubmit}
      />

      <DeleteBrandModal
        open={deleteTarget !== null}
        brand={deleteTarget}
        onClose={closeDeleteModal}
        onConfirm={handleDeleteBrandConfirm}
      />

      {toast && (
        <Toast content={toast} onDismiss={() => setToast(null)} duration={3500} />
      )}
    </Page>
  );
}

// ---------- subcomponents ---------------------------------------------------

function LoadingCard() {
  return (
    <Card>
      <Box padding="600">
        <InlineStack align="center" blockAlign="center" gap="200">
          <Spinner size="small" accessibilityLabel="Loading brands" />
          <Text as="span" tone="subdued">Loading brands…</Text>
        </InlineStack>
      </Box>
    </Card>
  );
}

function BrandsEmptyState({ onAddBrand }) {
  return (
    <Card>
      <Box padding="800">
        <BlockStack gap="300" inlineAlign="center">
          <Text as="h2" variant="headingMd" alignment="center">
            No brands registered yet
          </Text>
          <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
            Register your first brand to start offering customer-specific discounts.
          </Text>
          <Box paddingBlockStart="200">
            <Button variant="primary" onClick={onAddBrand}>
              Add brand
            </Button>
          </Box>
        </BlockStack>
      </Box>
    </Card>
  );
}

// Free plan: how many brands are used, and which ones don't get discounts
// when the store has more than the plan allows (for example after a downgrade).
function FreePlanNotice({ brands, brandLimit, onUpgrade }) {
  const upgrade = { content: 'Upgrade', onAction: onUpgrade };
  const names = (list) => list.map((b) => b.display_name).join(', ');

  if (brands.length > brandLimit) {
    const applied = brands.slice(0, brandLimit);
    const notApplied = brands.slice(brandLimit);
    return (
      <Banner
        tone="warning"
        title={`The free plan gives discounts on ${brandLimit} brands`}
        action={upgrade}
      >
        <p>
          {names(applied)} get discounts at checkout. {names(notApplied)}{' '}
          {notApplied.length === 1 ? "doesn't" : "don't"} until you upgrade or
          delete brands.
        </p>
      </Banner>
    );
  }

  if (brands.length === brandLimit) {
    return (
      <Banner tone="info" title={`Free plan: ${brandLimit} of ${brandLimit} brands used`} action={upgrade}>
        <p>Upgrade to add more brands.</p>
      </Banner>
    );
  }

  return (
    <Text as="p" tone="subdued">
      Free plan: {brands.length} of {brandLimit} brands used.
    </Text>
  );
}

function BrandsTable({ brands, brandLimit, onEdit, onDelete }) {
  const rows = brands.map((brand, index) => (
    <IndexTable.Row id={brand.tag} key={brand.tag} position={index}>
      <IndexTable.Cell>
        {brand.image_url ? (
          <Thumbnail source={brand.image_url} alt={brand.display_name} size="small" />
        ) : (
          // No image: a plain placeholder, since an empty source renders as a broken image.
          <Box
            background="bg-surface-secondary"
            borderRadius="200"
            borderWidth="025"
            borderColor="border"
            minWidth="40px"
            minHeight="40px"
          />
        )}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200" blockAlign="center">
          <Text as="span" fontWeight="semibold">
            {brand.display_name}
          </Text>
          {index >= brandLimit && <Badge tone="attention">No discounts on free plan</Badge>}
        </InlineStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" tone="subdued">{brand.tag}</Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <CollectionLink gid={brand.collection_id} />
      </IndexTable.Cell>
      <IndexTable.Cell>
        <ButtonGroup>
          <Button onClick={() => onEdit(brand)}>Edit</Button>
          <Button tone="critical" onClick={() => onDelete(brand)}>Delete</Button>
        </ButtonGroup>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Card padding="0">
      <IndexTable
        resourceName={{ singular: 'brand', plural: 'brands' }}
        itemCount={brands.length}
        selectable={false}
        headings={[
          { title: 'Image' },
          { title: 'Display name' },
          { title: 'Tag' },
          { title: 'Collection' },
          { title: 'Actions' },
        ]}
      >
        {rows}
      </IndexTable>
    </Card>
  );
}

function CollectionLink({ gid }) {
  const match = typeof gid === 'string' ? gid.match(/Collection\/(\d+)$/) : null;
  if (!match) {
    return <Text as="span" tone="subdued">—</Text>;
  }
  return (
    <Link url={`shopify:admin/collections/${match[1]}`}>View collection</Link>
  );
}

function PostAddBanner({ brand, onDismiss }) {
  return (
    <Banner
      tone="success"
      title={`Brand "${brand.display_name}" added`}
      onDismiss={onDismiss}
    >
      <BlockStack gap="100">
        <Text as="p" variant="bodyMd">Next steps:</Text>
        <Text as="p" variant="bodyMd">
          1. Add your {brand.display_name} products to the {brand.display_name}{' '}
          collection, or tag them with <code>{brand.tag}</code> (type the tag in
          full the first time). Either one makes them part of the brand.
        </Text>
        <Text as="p" variant="bodyMd">
          2. Optional: show the brand on your storefront by adding its
          collection to a section in the theme editor.
        </Text>
      </BlockStack>
    </Banner>
  );
}
