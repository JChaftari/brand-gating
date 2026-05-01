// Thin wrapper around the Shopify Admin GraphQL API via App Bridge Direct API
// Access. The `shopify:admin/api/<version>/graphql.json` URL is auto-authenticated
// by the App Bridge script in index.html — no token handling needed here.

const API_VERSION = '2026-01';
const ENDPOINT = `shopify:admin/api/${API_VERSION}/graphql.json`;

export class GraphQLError extends Error {
  constructor(message, { errors, userErrors } = {}) {
    super(message);
    this.name = 'GraphQLError';
    this.errors = errors;
    this.userErrors = userErrors;
  }
}

/**
 * Run a GraphQL query/mutation. Throws on transport, GraphQL, or HTTP errors.
 * Caller is responsible for inspecting per-mutation `userErrors` (use
 * `assertNoUserErrors` below for the common case).
 */
export async function gql(query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new GraphQLError(`HTTP ${res.status}: ${body}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    const msg = json.errors.map((e) => e.message).join('; ');
    throw new GraphQLError(`GraphQL errors: ${msg}`, { errors: json.errors });
  }

  return json.data;
}

/**
 * Throw a GraphQLError if a mutation result contains `userErrors`. Returns the
 * same result object for chaining.
 */
export function assertNoUserErrors(result, mutationName) {
  const userErrors = result?.userErrors;
  if (userErrors?.length) {
    const msg = userErrors
      .map((e) => `${e.field?.join('.') || '(no field)'}: ${e.message}`)
      .join('; ');
    throw new GraphQLError(`${mutationName} userErrors: ${msg}`, { userErrors });
  }
  return result;
}
