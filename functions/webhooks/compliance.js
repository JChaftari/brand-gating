// Cloudflare Pages Function — POST /webhooks/compliance
//
// Receives Shopify's three mandatory compliance (privacy) webhooks:
//   customers/data_request, customers/redact, shop/redact
// Required for public App Store distribution. Subscribed only by the public
// app (shopify.app.toml on branch public-release); the customer's
// custom-distribution app never sends here.
//
// Contract (per Shopify):
//   - Invalid or missing HMAC        → 401
//   - Valid HMAC                     → 200, action completed within 30 days
//
// The app stores no data outside Shopify (all state is in metafields), so
// there is nothing app-side to export or erase and every valid request is
// acknowledged. If the app ever keeps its own copy of customer or shop data,
// the per-topic handling below is where it gets exported / deleted.
//
// Secret: SHOPIFY_API_SECRET (the public app's client secret) must be set as an
// encrypted environment variable on the Pages project. Without it every
// request is rejected (fail closed).

const TOPICS = new Set(['customers/data_request', 'customers/redact', 'shop/redact']);

export async function onRequestPost({ request, env }) {
  // HMAC is computed over the raw bytes — read them before any JSON parsing.
  const body = await request.arrayBuffer();
  const hmacHeader = request.headers.get('x-shopify-hmac-sha256');

  if (!(await isValidHmac(body, hmacHeader, env.SHOPIFY_API_SECRET))) {
    return new Response('Unauthorized', { status: 401 });
  }

  const topic = request.headers.get('x-shopify-topic');
  const shop = request.headers.get('x-shopify-shop-domain');

  if (!TOPICS.has(topic)) {
    // Authentic Shopify request for a topic we didn't subscribe to here.
    // Acknowledge so Shopify doesn't retry.
    return new Response('ok', { status: 200 });
  }

  // No app-side data to export or delete for any topic (see header comment).
  // Log the receipt so there is a record that the request was handled.
  console.log(`compliance webhook handled: topic=${topic} shop=${shop}`);
  return new Response('ok', { status: 200 });
}

/**
 * Verify X-Shopify-Hmac-Sha256: base64(HMAC-SHA256(secret, rawBody)).
 * crypto.subtle.verify compares in constant time.
 */
async function isValidHmac(body, hmacHeader, secret) {
  if (!secret || !hmacHeader) return false;

  let signature;
  try {
    signature = Uint8Array.from(atob(hmacHeader), (c) => c.charCodeAt(0));
  } catch {
    return false; // not valid base64
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  return crypto.subtle.verify('HMAC', key, signature, body);
}
