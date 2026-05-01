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
} from '@shopify/polaris';
import { useBrandList } from '../hooks/useBrandList';
import AddBrandModal from '../components/AddBrandModal';
import EditBrandModal from '../components/EditBrandModal';
import DeleteBrandModal from '../components/DeleteBrandModal';

export default function BrandsPage() {
  const { brands, loading, error, discountCount, replace } = useBrandList();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);   // brand|null
  const [deleteTarget, setDeleteTarget] = useState(null); // brand|null
  const [toast, setToast] = useState(null);
  const [postAddBanner, setPostAddBanner] = useState(null);

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
          <Banner tone="warning" title="No active discount uses Brand Discount">
            <p>
              Brand updates won't take effect at checkout until you create an
              automatic discount that uses the Brand Discount app. Open
              Discounts → Create discount → Automatic discount and select
              "Brand Discount".
            </p>
          </Banner>
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
        <Thumbnail
          source={brand.image_url || ''}
          alt={brand.display_name}
          size="small"
        />
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
          1. Tag your {brand.display_name} products with <code>{brand.tag}</code> via
          Products → bulk edit.
        </Text>
        <Text as="p" variant="bodyMd">
          2. Add the brand to your homepage tiles section in the theme editor.
        </Text>
      </BlockStack>
    </Banner>
  );
}
