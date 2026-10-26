// Cloudflare Pages Function — GET /api/session
//
// Verifies the App Bridge session token the embedded app sends on load
// (Authorization: Bearer <token>). The app reads and writes store data through
// App Bridge Direct API access, which Shopify authenticates itself; this
// endpoint is the app's own check that the page was opened by a signed-in
// merchant of a real store, and it's what Shopify's "Using session tokens for
// user authentication" embedded-app check looks for.
//
// Session token = JWT signed HS256 with the app's client secret. Valid when:
//   - the signature verifies with SHOPIFY_API_SECRET
//   - aud is this app's client ID (SHOPIFY_API_KEY)
//   - exp / nbf hold (5 s clock leeway)
//   - dest is a https://<shop>.myshopify.com URL
// Responses: 200 { shop } when valid, 401 otherwise. Fails closed when the
// secret or client ID isn't configured.

const LEEWAY_SECONDS = 5;

export async function onRequestGet({ request, env }) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  const payload = await verifySessionToken(token, env.SHOPIFY_API_SECRET, env.SHOPIFY_API_KEY);
  if (!payload) {
    return Response.json({ ok: false }, { status: 401 });
  }
  return Response.json({ ok: true, shop: new URL(payload.dest).hostname });
}

async function verifySessionToken(token, secret, clientId) {
  if (!token || !secret || !clientId) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  let header, payload, signature;
  try {
    header = JSON.parse(decodeBase64Url(headerB64, 'text'));
    payload = JSON.parse(decodeBase64Url(payloadB64, 'text'));
    signature = decodeBase64Url(signatureB64, 'bytes');
  } catch {
    return null;
  }
  if (header.alg !== 'HS256') return null;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const signed = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  if (!(await crypto.subtle.verify('HMAC', key, signature, signed))) return null;

  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== clientId) return null;
  if (typeof payload.exp !== 'number' || now > payload.exp + LEEWAY_SECONDS) return null;
  if (typeof payload.nbf === 'number' && now < payload.nbf - LEEWAY_SECONDS) return null;
  if (!/^https:\/\/[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(payload.dest || '')) return null;

  return payload;
}

function decodeBase64Url(input, as) {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const binary = atob(b64);
  if (as === 'text') return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
