#!/usr/bin/env node
// Sends correctly signed sample compliance webhooks to the public app's
// endpoint and reports each HTTP status. Expect 200 for every topic and 401
// for the deliberately mis-signed control request.
//
// Usage (from the repo root):
//   node scripts/check-compliance-webhook.mjs [endpoint-url]
//
// The public app's client secret is read from SHOPIFY_API_SECRET, or prompted
// for with hidden input. It is only used locally to sign the requests.

import { createHmac } from 'node:crypto';
import readline from 'node:readline';

const url = process.argv[2] ?? 'https://brand-gating.pages.dev/webhooks/compliance';
const shop = 'brand-gating-test.myshopify.com';

const samples = {
  'customers/data_request': {
    shop_id: 1, shop_domain: shop, orders_requested: [],
    customer: { id: 1001, email: 'test@example.com', phone: null },
    data_request: { id: 9001 },
  },
  'customers/redact': {
    shop_id: 1, shop_domain: shop, orders_to_redact: [],
    customer: { id: 1001, email: 'test@example.com', phone: null },
  },
  'shop/redact': { shop_id: 1, shop_domain: shop },
};

// Set exitCode rather than calling process.exit(): exiting while fetch's
// sockets are still closing crashes Node on Windows (libuv assertion).
process.exitCode = await main();

async function main() {
  const secret = process.env.SHOPIFY_API_SECRET || (await promptHidden('Public app client secret: '));
  if (!secret) {
    console.error('No secret provided.');
    return 1;
  }

  let failures = 0;
  console.log(`Endpoint: ${url}\n`);

  for (const [topic, payload] of Object.entries(samples)) {
    failures += await check(topic, payload, secret, 200);
  }
  // Control: same request signed with the wrong secret must be rejected.
  failures += await check('customers/redact', samples['customers/redact'], 'wrong-secret', 401, ' (wrong signature)');

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed.');
  return failures ? 1 : 0;
}

async function check(topic, payload, signingSecret, expected, label = '') {
  const body = JSON.stringify(payload);
  const hmac = createHmac('sha256', signingSecret).update(body, 'utf8').digest('base64');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-shopify-topic': topic,
      'x-shopify-shop-domain': shop,
      'x-shopify-hmac-sha256': hmac,
    },
    body,
  });
  const ok = res.status === expected;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${topic}${label}: HTTP ${res.status} (expected ${expected})`);
  return ok ? 0 : 1;
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
    // Suppress echo of the typed/pasted characters.
    rl._writeToOutput = (s) => {
      if (s.startsWith(question)) rl.output.write(question);
    };
  });
}
