import { gql, assertNoUserErrors } from './graphql';

// Note: userErrors selection sets request only `field` and `message`. Some
// mutations expose a `code` field on their UserError subtype, but the parent
// UserError type does not — and we don't branch on codes anywhere. Keeping
// the projection minimal makes mutations portable across UserError subtypes.

const COLLECTION_CREATE_MUTATION = `
  mutation CollectionCreate($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection {
        id
        title
        handle
        image { url altText }
      }
      userErrors { field message }
    }
  }
`;

const COLLECTION_UPDATE_MUTATION = `
  mutation CollectionUpdate($input: CollectionInput!) {
    collectionUpdate(input: $input) {
      collection {
        id
        title
        handle
        image { url altText }
      }
      userErrors { field message }
    }
  }
`;

/**
 * Create a brand collection. Image is attached separately (via
 * `updateCollection`) to keep the failure modes distinct so the caller can
 * report orphan-collection issues cleanly.
 *
 * @param {{ title: string, handle: string }} args
 * @returns {Promise<{ id: string, title: string, handle: string }>}
 */
export async function createBrandCollection({ title, handle }) {
  const data = await gql(COLLECTION_CREATE_MUTATION, {
    input: { title, handle },
  });
  assertNoUserErrors(data.collectionCreate, 'collectionCreate');
  return data.collectionCreate.collection;
}

/**
 * Update a collection's title and/or featured image atomically.
 *
 * Argument semantics:
 *   - `title`     omitted/undefined → leave unchanged.
 *                 string             → set.
 *   - `imageUrl`  omitted/undefined → leave unchanged.
 *                 null or ''         → CLEAR existing image.
 *                 string             → set to new URL.
 *
 * If neither field is being changed, returns null without making a request.
 *
 * @param {{ collectionId: string, title?: string, imageUrl?: string|null, altText?: string }} args
 * @returns {Promise<object|null>}
 */
export async function updateCollection({ collectionId, title, imageUrl, altText }) {
  const input = { id: collectionId };
  let modified = false;

  if (title !== undefined) {
    input.title = title;
    modified = true;
  }

  if (imageUrl !== undefined) {
    if (imageUrl === null || imageUrl === '') {
      // Pass `image: null` to clear an existing featured image.
      input.image = null;
    } else {
      input.image = { src: imageUrl, ...(altText ? { altText } : {}) };
    }
    modified = true;
  }

  if (!modified) return null;

  const data = await gql(COLLECTION_UPDATE_MUTATION, { input });
  assertNoUserErrors(data.collectionUpdate, 'collectionUpdate');
  return data.collectionUpdate.collection;
}
