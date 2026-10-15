import fs from 'fs';
import { createServer } from 'vite';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✓ PASS: ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    failed++;
  }
}

async function runLocalWorkflowVerification() {
  console.log('======================================================');
  console.log('LOCAL DEVELOPMENT & SERVERLESS WORKFLOW VERIFICATION');
  console.log('======================================================\n');

  // Step 1: Start Vite dev server programmatically on a test port
  const TEST_PORT = 5199;
  console.log(`Starting Vite Dev Server on port ${TEST_PORT}...`);
  const server = await createServer({
    server: { port: TEST_PORT },
    logLevel: 'error',
  });
  await server.listen();
  console.log(`Vite Dev Server listening at http://localhost:${TEST_PORT}\n`);

  try {
    const baseUrl = `http://localhost:${TEST_PORT}`;

    // Test 1: Frontend SPA HTML Serving
    console.log('--- TEST 1: Frontend Static Assets Serving ---');
    const frontRes = await fetch(`${baseUrl}/`);
    assert(frontRes.status === 200, 'Frontend index.html returns HTTP 200');
    const frontHtml = await frontRes.text();
    assert(frontHtml.includes('<div id="root"></div>'), 'HTML contains React mount point');

    // Test 2: Serverless Route - Telegram Status Inspector
    console.log('\n--- TEST 2: Local Serverless Route /api/telegram-status ---');
    const statusRes = await fetch(`${baseUrl}/api/telegram-status`);
    assert(statusRes.status === 200, 'Endpoint /api/telegram-status responds HTTP 200');
    const statusData = await statusRes.json();
    assert(typeof statusData.configured === 'boolean', 'Returns configuration status boolean');
    assert(statusData.ok === true || statusData.configured === true, 'Successfully executed status handler');

    // Test 3: Serverless Route - Telegram Webhook Method Handling
    console.log('\n--- TEST 3: Local Serverless Route /api/telegram-webhook ---');
    const webhookGetRes = await fetch(`${baseUrl}/api/telegram-webhook`);
    assert(webhookGetRes.status === 200, 'GET /api/telegram-webhook returns HTTP 200');
    const webhookGetText = await webhookGetRes.text();
    assert(webhookGetText.includes('Telegram Webhook Active'), 'Descriptive banner for browser GET inspection');

    const webhookPostRes = await fetch(`${baseUrl}/api/telegram-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        update_id: 99901,
        message: {
          message_id: 1,
          chat: { id: 123456789 },
          from: { id: 123456789, first_name: 'Local', last_name: 'Dev' },
          text: '/status',
        },
      }),
    });
    assert(webhookPostRes.status === 200, 'POST /api/telegram-webhook processes Telegram update with HTTP 200');
    const webhookPostData = await webhookPostRes.json();
    assert(webhookPostData.ok === true, 'Returns ok: true to Telegram Bot API');

    // Test 4: Serverless Route - Webhook Setup Endpoint Validation
    console.log('\n--- TEST 4: Local Serverless Route /api/telegram-webhook-setup ---');
    const setupInvalidRes = await fetch(`${baseUrl}/api/telegram-webhook-setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl: 'http://insecure-url.com' }),
    });
    assert(setupInvalidRes.status === 400, 'Rejects insecure HTTP URL with HTTP 400');
    const setupInvalidData = await setupInvalidRes.json();
    assert(setupInvalidData.error.includes('HTTPS Webhook URL is required'), 'Enforces HTTPS tunnel requirement');

    // Test 5: Serverless Route - Notification Dispatcher Method & Payload Guard
    console.log('\n--- TEST 5: Local Serverless Route /api/telegram-notify ---');
    const notifyGetRes = await fetch(`${baseUrl}/api/telegram-notify`);
    assert(notifyGetRes.status === 405, 'Rejects GET with HTTP 405 Method Not Allowed');

    const notifyEmptyRes = await fetch(`${baseUrl}/api/telegram-notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert(notifyEmptyRes.status === 400, 'Empty payload rejected with HTTP 400');

  } finally {
    await server.close();
    console.log('\nVite Dev Server closed cleanly.');
  }

  console.log('\n======================================================');
  console.log(`LOCAL DEV VERIFICATION: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runLocalWorkflowVerification().catch((err) => {
  console.error('Local verification failed:', err);
  process.exit(1);
});
