import { useCallback, useState } from 'react';
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

export default function BrandsPage() {
  const { brands, loading, error, discountCount, replace, createDiscount } = useBrandList();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);   // brand|null
  const [deleteTarget, setDeleteTarget] = useState(null); // brand|null
  const [toast, setToast] = useState(null);
  const [postAddBanner, setPostAddBanner] = useState(null);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState(null);

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
      primaryAction={{
        content: 'Add brand',
        onAction: openAddModal,
      }}
    >
      <BlockStack gap="400">
        {error && (
          <Banner tone="critical" title="Failed to load brands">
            <p>{error.message}</p>
          </Banner>
        )}

        {!loading && discountCount === 0 && (
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

function BrandsTable({ brands, onEdit, onDelete }) {
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
        <Text as="span" fontWeight="semibold">
          {brand.display_name}
        </Text>
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
