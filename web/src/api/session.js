// Session check for the embedded app: gets a session token from App Bridge and
// has the app's own endpoint (functions/api/session.js) verify it.
//
// Store data goes through App Bridge Direct API access, which Shopify
// authenticates itself, so a failed check is reported but doesn't block the
// app. It's also what Shopify's "Using session tokens for user authentication"
// embedded-app check looks for: App Bridge issuing session tokens.

/**
 * @returns {Promise<{ ok: boolean, shop?: string }>}
 */
export async function verifySession() {
  const token = await window.shopify.idToken();
  const res = await fetch('/api/session', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { ok: false };
  return res.json();
}
