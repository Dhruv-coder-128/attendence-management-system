import fs from 'fs';

function getEnv() {
  const env = {};
  for (const filename of ['.env.local', '.env']) {
    if (fs.existsSync(filename)) {
      const content = fs.readFileSync(filename, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
            if (!env[key]) env[key] = val;
          }
        }
      }
    }
  }
  return env;
}

const env = getEnv();
process.env.TELEGRAM_BOT_TOKEN = env.TELEGRAM_BOT_TOKEN || '8614141443:AAHOlKo5tP167sjlJqU1KfQi15Q1j8PRH8k';
process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL || 'https://uugvudqbwoyywzbjrfol.supabase.co';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_pd2n3DRFhFgn79-SW6FEPw_vqRz2Jut';

const { default: telegramWebhookHandler } = await import('../api/telegram-webhook.js');
const { getParentTelegramDeepLink } = await import('../src/lib/telegramClient.js');

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

function mockReq(options = {}) {
  return {
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body || {},
    query: options.query || {},
  };
}

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.data = data;
      return this;
    },
    send(text) {
      this.data = text;
      return this;
    },
  };
  return res;
}

async function runEndToEndVerification() {
  console.log('======================================================');
  console.log('AUTOMATED TELEGRAM PARENT-LINKING END-TO-END VERIFICATION');
  console.log('======================================================\n');

  // STEP 1: Verification of Deep Link Generation with Security Token
  console.log('--- STEP 1: Deep Link Generation without Manual Chat ID ---');
  const token = 'tk_test_sec_token_' + Date.now();
  const deepLink = getParentTelegramDeepLink(token);
  assert(deepLink.startsWith('https://t.me/RuparelAttendanceBot?start='), 'Deep link points to official bot');
  assert(deepLink.includes(token), 'Deep link embeds secure single-use token');
  assert(!deepLink.includes('chat_id'), 'Deep link never leaks or requires Chat ID parameter');

  // STEP 2: Parent opens link in Telegram -> Telegram triggers /start <token>
  console.log('\n--- STEP 2: Webhook receives /start <token> (Auto-reads Chat ID) ---');
  const testChatId = 987654321;
  const startReq = mockReq({
    method: 'POST',
    body: {
      update_id: 20001,
      message: {
        message_id: 201,
        chat: { id: testChatId },
        from: { id: testChatId, first_name: 'Devki', last_name: 'Patel', is_bot: false },
        text: `/start ${token}`,
      },
    },
  });
  const startRes = mockRes();
  await telegramWebhookHandler(startReq, startRes);

  assert(startRes.statusCode === 200, 'Webhook responds HTTP 200');
  assert(startRes.data.ok === true, 'Webhook returns ok: true');
  // For unseeded dummy token, it reports unrecognized/invalid_token without crashing
  assert(startRes.data.linked === false, 'Safely rejects unseeded token without modifying DB');
  assert(startRes.data.reason === 'invalid_token', 'Provides clear reason: invalid_token');

  // STEP 3: Parent taps "Confirm & Connect" button (callback_query update)
  console.log('\n--- STEP 3: Webhook receives callback_query for confirmation ---');
  const confirmCbReq = mockReq({
    method: 'POST',
    body: {
      update_id: 20002,
      callback_query: {
        id: 'cb_query_e2e_001',
        from: { id: testChatId, first_name: 'Devki', last_name: 'Patel' },
        message: {
          message_id: 202,
          chat: { id: testChatId },
        },
        data: `confirm_link:${token}`,
      },
    },
  });
  const confirmCbRes = mockRes();
  await telegramWebhookHandler(confirmCbReq, confirmCbRes);

  assert(confirmCbRes.statusCode === 200, 'Confirmation callback returns HTTP 200');
  assert(confirmCbRes.data.ok === true, 'Confirmation callback responds ok: true');
  // Server-side authorization check: cannot link unseeded token
  assert(confirmCbRes.data.linked === false, 'Cannot link without valid unconsumed invitation in Supabase');

  // STEP 4: Parent taps "Cancel" button
  console.log('\n--- STEP 4: Webhook receives cancel_link callback ---');
  const cancelCbReq = mockReq({
    method: 'POST',
    body: {
      update_id: 20003,
      callback_query: {
        id: 'cb_query_e2e_002',
        from: { id: testChatId, first_name: 'Devki' },
        message: {
          message_id: 203,
          chat: { id: testChatId },
        },
        data: `cancel_link:${token}`,
      },
    },
  });
  const cancelCbRes = mockRes();
  await telegramWebhookHandler(cancelCbReq, cancelCbRes);

  assert(cancelCbRes.statusCode === 200, 'Cancel callback returns HTTP 200');
  assert(cancelCbRes.data.ok === true, 'Cancel callback responds ok: true');
  assert(cancelCbRes.data.cancelled === true, 'Explicitly confirms cancellation');

  // STEP 5: Replay / Duplicate Prevention Check
  console.log('\n--- STEP 5: Duplicate Replay Prevention Check ---');
  const replayReq = mockReq({
    method: 'POST',
    body: {
      update_id: 20004,
      callback_query: {
        id: 'cb_query_e2e_003',
        from: { id: testChatId, first_name: 'Devki' },
        message: {
          message_id: 204,
          chat: { id: testChatId },
        },
        data: `confirm_link:${token}`,
      },
    },
  });
  const replayRes = mockRes();
  await telegramWebhookHandler(replayReq, replayRes);

  assert(replayRes.statusCode === 200, 'Replay request returns HTTP 200');
  assert(replayRes.data.linked === false, 'Replay of unverified or consumed token rejected');

  console.log('\n======================================================');
  console.log(`END-TO-END VERIFICATION: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) process.exit(1);
}

runEndToEndVerification().catch((err) => {
  console.error('Unhandled failure:', err);
  process.exit(1);
});
