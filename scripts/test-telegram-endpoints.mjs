import fs from 'fs';
import { getParentTelegramDeepLink } from '../src/lib/telegramClient.js';
import telegramStatusHandler from '../api/telegram-status.js';
import telegramWebhookHandler from '../api/telegram-webhook.js';
import telegramNotifyHandler from '../api/telegram-notify.js';

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

// Load env
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

async function runTests() {
  console.log('======================================================');
  console.log('TELEGRAM & BATCH RESOLUTION END-TO-END TEST SUITE');
  console.log('======================================================\n');

  // TEST 1: Telegram Deep Link Generator
  console.log('--- TEST 1: Telegram Deep Link Generator ---');
  const link1 = getParentTelegramDeepLink('tk_abcdef123456');
  assert(link1 === 'https://t.me/RuparelAttendanceBot?start=tk_abcdef123456', 'Deep link preserves tk_ prefix');

  const link2 = getParentTelegramDeepLink('link_789');
  assert(link2 === 'https://t.me/RuparelAttendanceBot?start=link_789', 'Deep link preserves link_ prefix');

  const link3 = getParentTelegramDeepLink('plainToken');
  assert(link3 === 'https://t.me/RuparelAttendanceBot?start=tk_plainToken', 'Deep link prefixes plain token with tk_');

  const link4 = getParentTelegramDeepLink('');
  assert(link4 === '', 'Deep link handles empty token gracefully');

  // TEST 2: Telegram Bot Status Inspector (/api/telegram-status)
  console.log('\n--- TEST 2: Telegram Bot Status Inspector (/api/telegram-status) ---');
  const statusReq = mockReq({ method: 'GET' });
  const statusRes = mockRes();
  await telegramStatusHandler(statusReq, statusRes);

  assert(statusRes.statusCode === 200, 'Status endpoint returns HTTP 200');
  assert(statusRes.data.ok === true, 'Status response explicitly sets ok: true');
  assert(statusRes.data.valid === true, 'Status response marks valid: true for active bot token');
  assert(statusRes.data.configured === true, 'Status response marks configured: true');
  assert(statusRes.data.bot?.username === 'RuparelAttendanceBot', 'Status returns bot username @RuparelAttendanceBot');
  assert(statusRes.data.bot?.firstName === 'Ruparel Attendence ERP', 'Status returns bot firstName');
  assert(statusRes.data.webhook !== undefined, 'Status returns webhook configuration object');

  // TEST 3: Telegram Webhook /start without param
  console.log('\n--- TEST 3: Telegram Webhook /start & /start@bot Handling ---');
  const startReq = mockReq({
    method: 'POST',
    body: {
      update_id: 10001,
      message: {
        message_id: 101,
        chat: { id: 123456789 },
        from: { id: 123456789, first_name: 'Test_Parent_Name', is_bot: false },
        text: '/start',
      },
    },
  });
  const startRes = mockRes();
  await telegramWebhookHandler(startReq, startRes);

  assert(startRes.statusCode === 200, 'Webhook returns HTTP 200 for /start');
  assert(startRes.data.ok === true, 'Webhook returns ok: true');

  // TEST 4: Telegram Webhook with bot username in command: /start@RuparelAttendanceBot
  const startWithMentionReq = mockReq({
    method: 'POST',
    body: {
      update_id: 10002,
      message: {
        message_id: 102,
        chat: { id: 123456789 },
        from: { id: 123456789, first_name: 'Test Parent', is_bot: false },
        text: '/start@RuparelAttendanceBot',
      },
    },
  });
  const startWithMentionRes = mockRes();
  await telegramWebhookHandler(startWithMentionReq, startWithMentionRes);

  assert(startWithMentionRes.statusCode === 200, 'Webhook handles /start@RuparelAttendanceBot gracefully');
  assert(startWithMentionRes.data.ok === true, 'Webhook responds ok: true');

  // TEST 5: Telegram Webhook /status check
  console.log('\n--- TEST 5: Telegram Webhook /status Command ---');
  const statusCmdReq = mockReq({
    method: 'POST',
    body: {
      update_id: 10003,
      message: {
        message_id: 103,
        chat: { id: 987654321 },
        from: { id: 987654321, first_name: 'Unlinked Guardian', is_bot: false },
        text: '/status',
      },
    },
  });
  const statusCmdRes = mockRes();
  await telegramWebhookHandler(statusCmdReq, statusCmdRes);

  assert(statusCmdRes.statusCode === 200, 'Webhook handles /status with HTTP 200');
  assert(statusCmdRes.data.ok === true, 'Webhook returns ok: true for status check');

  // TEST 6: Webhook Non-POST Method Guard
  console.log('\n--- TEST 6: Webhook Method Guard ---');
  const getReq = mockReq({ method: 'GET' });
  const getRes = mockRes();
  await telegramWebhookHandler(getReq, getRes);
  assert(getRes.statusCode === 200, 'Webhook responds informative 200 to browser GET inspection');
  assert(typeof getRes.data === 'string' && getRes.data.includes('Active'), 'GET describes active webhook endpoint');

  // TEST 7: Notification Dispatcher Method Guard (/api/telegram-notify)
  console.log('\n--- TEST 7: Notification Dispatcher Method Guard (/api/telegram-notify) ---');
  const notifyGetReq = mockReq({ method: 'GET' });
  const notifyGetRes = mockRes();
  await telegramNotifyHandler(notifyGetReq, notifyGetRes);
  assert(notifyGetRes.statusCode === 405, 'Notification API rejects GET with HTTP 405 Method Not Allowed');

  // TEST 8: Notification Dispatcher Payload Validation
  console.log('\n--- TEST 8: Notification Dispatcher Payload Validation ---');
  const notifyEmptyReq = mockReq({ method: 'POST', body: {} });
  const notifyEmptyRes = mockRes();
  await telegramNotifyHandler(notifyEmptyReq, notifyEmptyRes);
  assert(notifyEmptyRes.statusCode === 400, 'Empty payload rejected with HTTP 400');
  assert(notifyEmptyRes.data.error.includes('Invalid request payload'), 'Explains missing batchId / studentId');

  // TEST 9: Notification Dispatcher Unknown Batch Resolution
  console.log('\n--- TEST 9: Notification Dispatcher Unknown Batch Resolution ---');
  const notifyUnknownBatchReq = mockReq({
    method: 'POST',
    body: {
      batchId: '00000000-0000-0000-0000-000000000000',
      date: '2026-10-09',
    },
  });
  const notifyUnknownBatchRes = mockRes();
  await telegramNotifyHandler(notifyUnknownBatchReq, notifyUnknownBatchRes);
  assert(notifyUnknownBatchRes.statusCode === 404, 'Returns HTTP 404 when batch is not found');
  assert(notifyUnknownBatchRes.data.error.includes('not found in database'), 'Diagnostic explains batch not found');

  // TEST 10: Notification Dispatcher String Identifier Lookup
  console.log('\n--- TEST 10: Notification Dispatcher Code / Name Resolution ---');
  const notifyCodeReq = mockReq({
    method: 'POST',
    body: {
      batchId: 'NONEXISTENT-BATCH-CODE',
      date: '2026-10-09',
    },
  });
  const notifyCodeRes = mockRes();
  await telegramNotifyHandler(notifyCodeReq, notifyCodeRes);
  assert(notifyCodeRes.statusCode === 404, 'Returns 404 for nonexistent code identifier');
  assert(notifyCodeRes.data.error.includes('NONEXISTENT-BATCH-CODE'), 'Includes searched identifier in diagnostic');

  console.log('\n======================================================');
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
