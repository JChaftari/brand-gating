// Admin UI extension — Preact + web components.
//
// Why Preact (not React): Shopify enforces a 64 KB compiled-bundle limit on
// admin UI extensions as of API 2025-10. The React + ui-extensions-react +
// react-reconciler stack bundles to ~73 KB minimum and cannot fit. Shopify's
// official migration path is Preact + web components — see
// https://github.com/Shopify/example-admin-action-and-block-preact.
//
// Web components (<s-admin-block>, <s-stack>, <s-text>, <s-table>, <s-button>,
// <s-text-field>, <s-number-field>, <s-form>, etc.) are auto-registered by the
// host iframe; no imports needed.
//
// Globals available inside the extension iframe:
//   shopify.data       page-context data (shopify.data.selected[0].id is the
//                      customer GID on customer-details targets)
//   shopify.query      Admin GraphQL Direct API Access (queries + mutations)
//   shopify.toast      toast notifications: shopify.toast.show(message)
//
// Build status: data loading + Add + Edit + Remove. Phase 2 customer card
// feature-complete.

import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { loadCustomerBrandData, saveCustomerBrandDiscounts } from './api';

export default async () => {
  render(<BrandDiscountsBlock />, document.body);
};

function BrandDiscountsBlock() {
  const customerId = shopify?.data?.selected?.[0]?.id ?? null;

  // Top-level data state: { status: 'loading' | 'error' | 'loaded', rows?, brands?, error? }
  const [state, setState] = useState({ status: 'loading' });

  // Add-flow state
  const [addingMode, setAddingMode] = useState(false);
  const [pendingBrand, setPendingBrand] = useState('');
  const [pendingPercentage, setPendingPercentage] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState(null);

  // Edit-flow state. editingTag === null means no row is being edited.
  const [editingTag, setEditingTag] = useState(null);
  const [editingPercentage, setEditingPercentage] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState(null);

  // Remove-flow state. confirmingRemoveTag === null means no row is in the
  // confirmation step.
  const [confirmingRemoveTag, setConfirmingRemoveTag] = useState(null);
  const [removeSaving, setRemoveSaving] = useState(false);
  const [removeError, setRemoveError] = useState(null);

  // Add / Edit / Remove are mutually exclusive — starting one cancels the
  // other two. Clearing helpers below keep the bookkeeping in one place.
  function clearAdd() {
    setAddingMode(false);
    setPendingBrand('');
    setPendingPercentage('');
    setAddError(null);
  }
  function clearEdit() {
    setEditingTag(null);
    setEditingPercentage('');
    setEditError(null);
  }
  function clearRemove() {
    setConfirmingRemoveTag(null);
    setRemoveError(null);
  }

  useEffect(() => {
    if (!customerId) {
      setState({
        status: 'error',
        error: new Error('No customer selected (shopify.data.selected is empty).'),
      });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { discounts, brands } = await loadCustomerBrandData(customerId);
        if (cancelled) return;
        setState({
          status: 'loaded',
          rows: joinAndSort(discounts, brands),
          brands,
        });
      } catch (err) {
        if (cancelled) return;
        setState({ status: 'error', error: err });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  // Brands available for picking — registered brands minus those the customer
  // already has assigned (whether stale or not).
  const availableBrands = useMemo(() => {
    if (state.status !== 'loaded') return [];
    const used = new Set(state.rows.map((r) => r.brand_tag));
    return state.brands
      .filter((b) => b?.tag && !used.has(b.tag))
      .slice()
      .sort((a, b) =>
        a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' })
      );
  }, [state]);

  // ---- add-flow handlers --------------------------------------------------

  function startAdd() {
    clearEdit();
    clearRemove();
    setAddingMode(true);
    setPendingBrand('');
    setPendingPercentage('');
    setAddError(null);
  }

  async function confirmAdd() {
    setAddError(null);

    if (!pendingBrand) {
      setAddError(new Error('Choose a brand.'));
      return;
    }
    const pct = Number(pendingPercentage);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setAddError(new Error('Percentage must be a number between 0 and 100.'));
      return;
    }

    setAddSaving(true);
    try {
      const existingDiscounts = state.rows.map((r) => ({
        brand_tag: r.brand_tag,
        percentage: r.percentage,
      }));
      const newDiscounts = [
        ...existingDiscounts,
        { brand_tag: pendingBrand, percentage: pct },
      ];

      await saveCustomerBrandDiscounts(customerId, newDiscounts);

      setState({
        ...state,
        rows: joinAndSort(newDiscounts, state.brands),
      });
      clearAdd();
      shopify?.toast?.show?.('Brand discount added');
    } catch (err) {
      setAddError(err);
    } finally {
      setAddSaving(false);
    }
  }

  // ---- edit-flow handlers -------------------------------------------------

  function startEdit(row) {
    clearAdd();
    clearRemove();
    setEditingTag(row.brand_tag);
    setEditingPercentage(String(row.percentage));
    setEditError(null);
  }

  async function confirmEdit() {
    setEditError(null);

    const pct = Number(editingPercentage);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setEditError(new Error('Percentage must be a number between 0 and 100.'));
      return;
    }

    setEditSaving(true);
    try {
      const newDiscounts = state.rows.map((r) =>
        r.brand_tag === editingTag
          ? { brand_tag: r.brand_tag, percentage: pct }
          : { brand_tag: r.brand_tag, percentage: r.percentage }
      );

      await saveCustomerBrandDiscounts(customerId, newDiscounts);

      setState({
        ...state,
        rows: joinAndSort(newDiscounts, state.brands),
      });
      clearEdit();
      shopify?.toast?.show?.('Brand discount updated');
    } catch (err) {
      setEditError(err);
    } finally {
      setEditSaving(false);
    }
  }

  // ---- remove-flow handlers -----------------------------------------------

  function startRemove(row) {
    clearAdd();
    clearEdit();
    setConfirmingRemoveTag(row.brand_tag);
    setRemoveError(null);
  }

  async function confirmRemove() {
    setRemoveError(null);
    setRemoveSaving(true);
    try {
      const newDiscounts = state.rows
        .filter((r) => r.brand_tag !== confirmingRemoveTag)
        .map((r) => ({ brand_tag: r.brand_tag, percentage: r.percentage }));

      await saveCustomerBrandDiscounts(customerId, newDiscounts);

      setState({
        ...state,
        rows: joinAndSort(newDiscounts, state.brands),
      });
      clearRemove();
      shopify?.toast?.show?.('Brand discount removed');
    } catch (err) {
      setRemoveError(err);
    } finally {
      setRemoveSaving(false);
    }
  }

  // ---- render -------------------------------------------------------------

  // At most one of these is non-null at a time — the start* handlers clear the
  // others. Show whichever is active.
  const activeError = addError || editError || removeError;

  const anyModeActive = addingMode || editingTag !== null || confirmingRemoveTag !== null;

  return (
    <s-admin-block heading="Brand Discounts">
      {state.status === 'loading' && <LoadingState />}

      {state.status === 'error' && <ErrorBanner error={state.error} />}

      {state.status === 'loaded' && (
        <s-stack direction="block">
          {activeError && <ErrorBanner error={activeError} />}

          {state.rows.length === 0 && !addingMode ? (
            <EmptyStateWithAdd onAdd={startAdd} />
          ) : (
            <DiscountsTable
              rows={state.rows}
              addingMode={addingMode}
              availableBrands={availableBrands}
              pendingBrand={pendingBrand}
              pendingPercentage={pendingPercentage}
              addSaving={addSaving}
              onPendingBrandChange={setPendingBrand}
              onPendingPercentageChange={setPendingPercentage}
              onConfirmAdd={confirmAdd}
              onCancelAdd={clearAdd}
              editingTag={editingTag}
              editingPercentage={editingPercentage}
              editSaving={editSaving}
              onEditingPercentageChange={setEditingPercentage}
              onStartEdit={startEdit}
              onConfirmEdit={confirmEdit}
              onCancelEdit={clearEdit}
              confirmingRemoveTag={confirmingRemoveTag}
              removeSaving={removeSaving}
              onStartRemove={startRemove}
              onConfirmRemove={confirmRemove}
              onCancelRemove={clearRemove}
            />
          )}

          {!anyModeActive &&
            state.rows.length > 0 &&
            availableBrands.length > 0 && <AddButton onAdd={startAdd} />}

          {!anyModeActive &&
            state.rows.length > 0 &&
            availableBrands.length === 0 && (
              <s-text tone="subdued">All registered brands are already assigned.</s-text>
            )}
        </s-stack>
      )}
    </s-admin-block>
  );
}

// ---------- states ----------------------------------------------------------

function LoadingState() {
  return (
    <s-stack direction="block">
      <s-spinner accessibilityLabel="Loading brand discounts" />
    </s-stack>
  );
}

function ErrorBanner({ error }) {
  return (
    <s-stack direction="block">
      <s-text tone="critical">{error.message}</s-text>
    </s-stack>
  );
}

function EmptyStateWithAdd({ onAdd }) {
  return (
    <s-stack direction="block">
      <s-text>No brand discounts yet.</s-text>
      <s-button onClick={onAdd}>+ Add the first one</s-button>
    </s-stack>
  );
}

function AddButton({ onAdd }) {
  return (
    <s-stack direction="block">
      <s-button onClick={onAdd}>+ Add brand discount</s-button>
    </s-stack>
  );
}

// ---------- table -----------------------------------------------------------

function DiscountsTable(props) {
  const {
    rows,
    addingMode,
    availableBrands,
    pendingBrand,
    pendingPercentage,
    addSaving,
    onPendingBrandChange,
    onPendingPercentageChange,
    onConfirmAdd,
    onCancelAdd,
    editingTag,
    editingPercentage,
    editSaving,
    onEditingPercentageChange,
    onStartEdit,
    onConfirmEdit,
    onCancelEdit,
    confirmingRemoveTag,
    removeSaving,
    onStartRemove,
    onConfirmRemove,
    onCancelRemove,
  } = props;

  return (
    <s-table>
      <s-table-header-row>
        <s-table-header>Brand</s-table-header>
        <s-table-header>Percentage</s-table-header>
        <s-table-header>Actions</s-table-header>
      </s-table-header-row>
      <s-table-body>
        {rows.map((row) => (
          <DiscountRow
            key={row.brand_tag}
            row={row}
            isEditing={editingTag === row.brand_tag}
            isConfirmingRemove={confirmingRemoveTag === row.brand_tag}
            editingPercentage={editingPercentage}
            editSaving={editSaving}
            removeSaving={removeSaving}
            onEditingPercentageChange={onEditingPercentageChange}
            onStartEdit={onStartEdit}
            onConfirmEdit={onConfirmEdit}
            onCancelEdit={onCancelEdit}
            onStartRemove={onStartRemove}
            onConfirmRemove={onConfirmRemove}
            onCancelRemove={onCancelRemove}
          />
        ))}
        {addingMode && (
          <EditableAddRow
            availableBrands={availableBrands}
            pendingBrand={pendingBrand}
            pendingPercentage={pendingPercentage}
            saving={addSaving}
            onPendingBrandChange={onPendingBrandChange}
            onPendingPercentageChange={onPendingPercentageChange}
            onConfirm={onConfirmAdd}
            onCancel={onCancelAdd}
          />
        )}
      </s-table-body>
    </s-table>
  );
}

function DiscountRow({
  row,
  isEditing,
  isConfirmingRemove,
  editingPercentage,
  editSaving,
  removeSaving,
  onEditingPercentageChange,
  onStartEdit,
  onConfirmEdit,
  onCancelEdit,
  onStartRemove,
  onConfirmRemove,
  onCancelRemove,
}) {
  return (
    <s-table-row>
      <s-table-cell>
        <BrandCell row={row} />
      </s-table-cell>
      <s-table-cell>
        {isEditing ? (
          <s-number-field
            label="Percentage"
            labelAccessibilityVisibility="exclusive"
            value={editingPercentage}
            onChange={(e) => onEditingPercentageChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onConfirmEdit();
            }}
            min="0"
            max="100"
            suffix="%"
            disabled={editSaving}
          />
        ) : (
          <s-text>{row.percentage}%</s-text>
        )}
      </s-table-cell>
      <s-table-cell>
        <RowActions
          row={row}
          isEditing={isEditing}
          isConfirmingRemove={isConfirmingRemove}
          editSaving={editSaving}
          removeSaving={removeSaving}
          onStartEdit={onStartEdit}
          onConfirmEdit={onConfirmEdit}
          onCancelEdit={onCancelEdit}
          onStartRemove={onStartRemove}
          onConfirmRemove={onConfirmRemove}
          onCancelRemove={onCancelRemove}
        />
      </s-table-cell>
    </s-table-row>
  );
}

function RowActions({
  row,
  isEditing,
  isConfirmingRemove,
  editSaving,
  removeSaving,
  onStartEdit,
  onConfirmEdit,
  onCancelEdit,
  onStartRemove,
  onConfirmRemove,
  onCancelRemove,
}) {
  if (isEditing) {
    return (
      <s-stack direction="inline">
        <s-button variant="primary" onClick={onConfirmEdit} disabled={editSaving}>
          Save
        </s-button>
        <s-button variant="tertiary" onClick={onCancelEdit} disabled={editSaving}>
          Cancel
        </s-button>
      </s-stack>
    );
  }

  if (isConfirmingRemove) {
    return (
      <s-stack direction="inline">
        <s-text>Remove?</s-text>
        <s-button variant="primary" onClick={onConfirmRemove} disabled={removeSaving}>
          Yes, remove
        </s-button>
        <s-button variant="tertiary" onClick={onCancelRemove} disabled={removeSaving}>
          Cancel
        </s-button>
      </s-stack>
    );
  }

  // Default actions. Edit is hidden for stale rows (the brand no longer
  // exists in the registry, so editing the percentage would be meaningless —
  // function won't apply it anyway). Remove is allowed for stale rows; that
  // is the only way to clean them out.
  return (
    <s-stack direction="inline">
      {!row.stale && (
        <s-button variant="tertiary" onClick={() => onStartEdit(row)}>
          Edit
        </s-button>
      )}
      <s-button variant="tertiary" onClick={() => onStartRemove(row)}>
        Remove
      </s-button>
    </s-stack>
  );
}

function BrandCell({ row }) {
  if (!row.stale) {
    return <s-text>{row.display_name}</s-text>;
  }
  return (
    <s-stack direction="inline">
      <s-text tone="critical">{row.display_name} (no longer registered)</s-text>
    </s-stack>
  );
}

function EditableAddRow({
  availableBrands,
  pendingBrand,
  pendingPercentage,
  saving,
  onPendingBrandChange,
  onPendingPercentageChange,
  onConfirm,
  onCancel,
}) {
  return (
    <s-table-row>
      <s-table-cell>
        <s-select
          label="Brand"
          labelAccessibilityVisibility="exclusive"
          value={pendingBrand}
          onChange={(e) => onPendingBrandChange(e.target.value)}
          disabled={saving}
        >
          <s-option value="">Choose a brand</s-option>
          {availableBrands.map((b) => (
            <s-option key={b.tag} value={b.tag}>
              {b.display_name}
            </s-option>
          ))}
        </s-select>
      </s-table-cell>
      <s-table-cell>
        <s-number-field
          label="Percentage"
          labelAccessibilityVisibility="exclusive"
          value={pendingPercentage}
          onChange={(e) => onPendingPercentageChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onConfirm();
          }}
          min="0"
          max="100"
          suffix="%"
          disabled={saving}
        />
      </s-table-cell>
      <s-table-cell>
        <s-stack direction="inline">
          <s-button variant="primary" onClick={onConfirm} disabled={saving}>
            Save
          </s-button>
          <s-button variant="tertiary" onClick={onCancel} disabled={saving}>
            Cancel
          </s-button>
        </s-stack>
      </s-table-cell>
    </s-table-row>
  );
}

// ---------- pure helpers ----------------------------------------------------

/**
 * Join customer's discount entries with the shop's brand registry.
 * - Falls back to brand_tag as display_name when stale.
 * - Sorts alphabetically by display_name (case-insensitive).
 * - Filters out entries missing brand_tag entirely (defensive).
 */
function joinAndSort(discounts, brands) {
  const brandByTag = new Map();
  for (const b of brands) {
    if (b?.tag) brandByTag.set(b.tag, b);
  }

  return discounts
    .filter((d) => d?.brand_tag)
    .map((d) => {
      const brand = brandByTag.get(d.brand_tag);
      return {
        brand_tag: d.brand_tag,
        percentage: Number(d.percentage),
        display_name: brand?.display_name ?? d.brand_tag,
        stale: !brand,
      };
    })
    .sort((a, b) =>
      a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' })
    );
}
