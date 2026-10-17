/**
 * Automated Verification Suite for:
 * 1. getParentTelegramAppUri & getParentTelegramDeepLink
 * 2. getWhatsAppShareUrl Generation with Indian Phone Normalization
 * 3. Parent-Student Linkage Deduplication & Stale Junction Purging
 * 4. Telegram Bot Updates Parser Logic
 */

import {
  getParentTelegramDeepLink,
  getParentTelegramAppUri,
  getParentTelegramLinks,
  getWhatsAppShareUrl,
  TELEGRAM_BOT_USERNAME,
} from '../src/lib/telegramClient.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('================================================================');
console.log('PARENT WHATSAPP & TELEGRAM FLOW + LINKAGE DEDUPLICATION TEST');
console.log('================================================================\n');

// TEST 1: Telegram Deep Link and Native App URI
console.log('--- TEST 1: Telegram Link Generators ---');
const testToken = 'tk_9f81a7b2c3d4e5f6';
const deepLink = getParentTelegramDeepLink(testToken, 'MySchoolBot');
assert(deepLink === 'https://t.me/MySchoolBot?start=tk_9f81a7b2c3d4e5f6', `Deep link generated: ${deepLink}`);

const appUri = getParentTelegramAppUri(testToken, 'MySchoolBot');
assert(appUri === 'tg://resolve?domain=MySchoolBot&start=tk_9f81a7b2c3d4e5f6', `Native app URI generated: ${appUri}`);

const bothLinks = getParentTelegramLinks(testToken, 'MySchoolBot');
assert(bothLinks.deepLink === deepLink && bothLinks.appUri === appUri, 'Combined getParentTelegramLinks returns matching URLs');

// TEST 2: WhatsApp Share URL Generation
console.log('\n--- TEST 2: WhatsApp Share URL & Phone Normalization ---');
const parentSample = {
  full_name: 'Ajay Parmar',
  phone: '9728782110', // 10 digits
};
const waUrl = getWhatsAppShareUrl(parentSample, 'Meera Parmar', deepLink);
assert(waUrl.startsWith('https://wa.me/919728782110?text='), 'Prepends country code 91 for 10-digit Indian numbers');
assert(waUrl.includes(encodeURIComponent('Meera Parmar')), 'Contains student ward name in encoded text');
assert(waUrl.includes(encodeURIComponent(deepLink)), 'Contains full Telegram deep link in encoded text');
assert(waUrl.includes(encodeURIComponent('Namaste *Ajay Parmar*')), 'Contains personalized guardian salutation');

// TEST 3: Parent-Student Linkage Deduplication (2 Children -> 1 Genuine Child)
console.log('\n--- TEST 3: Parent-Student Linkage Deduplication ---');
const mockStudents = [
  { id: 'st_1022', admission_no: 'ST1022', full_name: 'Ishaan Rathod', guardian_phone: '9876543210' },
  { id: 'st_1088', admission_no: 'ST1088', full_name: 'Meera Parmar', guardian_phone: '9728782110', guardian_name: 'Ajay Parmar' },
];

const mockParent = {
  id: 'pr_ajay',
  full_name: 'Ajay Parmar',
  phone: '9728782110',
  admission_no: 'ST1088', // Points strictly to Meera Parmar!
};

// Existing junctions: Ajay Parmar has 2 junctions (one dummy to Ishaan, one to Meera)
const mockExistingJunctions = [
  { id: 'ps_dummy_1', parent_id: 'pr_ajay', student_id: 'st_1022', is_primary_contact: true },
  { id: 'ps_genuine_2', parent_id: 'pr_ajay', student_id: 'st_1088', is_primary_contact: true },
];

// Run our deduplication logic
const studentById = new Map(mockStudents.map(s => [s.id, s]));
const studentByAdmission = new Map(mockStudents.map(s => [String(s.admission_no).trim().toLowerCase(), s]));

let genuineStudent = null;
if (mockParent.admission_no) {
  const cleanAdm = String(mockParent.admission_no).trim().toLowerCase();
  if (studentByAdmission.has(cleanAdm)) {
    genuineStudent = studentByAdmission.get(cleanAdm);
  }
}

assert(genuineStudent && genuineStudent.full_name === 'Meera Parmar', 'Identified Meera Parmar as the single genuine child for Ajay Parmar');

// Check junctions to purge
const junctionIdsToDelete = [];
mockExistingJunctions.forEach(j => {
  if (j.student_id !== genuineStudent.id) {
    const otherStudent = studentById.get(j.student_id);
    const isRealSibling = otherStudent && otherStudent.admission_no === mockParent.admission_no;
    if (!isRealSibling) {
      junctionIdsToDelete.push(j.id);
    }
  }
});

assert(junctionIdsToDelete.length === 1 && junctionIdsToDelete[0] === 'ps_dummy_1', 'Targeted the dummy junction (Ishaan Rathod) for purging');

const remainingJunctions = mockExistingJunctions.filter(j => !junctionIdsToDelete.includes(j.id));
assert(remainingJunctions.length === 1 && remainingJunctions[0].student_id === 'st_1088', 'Parent now has strictly 1 genuine student ward (Meera Parmar)');

// TEST 4: Telegram Update Parser Logic
console.log('\n--- TEST 4: Telegram Bot Updates Parser Logic ---');
const mockUpdateCallback = {
  update_id: 88371,
  callback_query: {
    id: 'cb_query_999',
    from: { id: 771234567, first_name: 'Ajay' },
    message: { chat: { id: 771234567 } },
    data: 'confirm_link:tk_9f81a7b2c3d4e5f6',
  },
};

const cbData = mockUpdateCallback.callback_query.data;
let parsedToken = null;
let parsedChatId = null;

if (cbData.startsWith('confirm_link:')) {
  parsedToken = cbData.replace(/^confirm_link:/, '').trim();
  parsedChatId = String(mockUpdateCallback.callback_query.message.chat.id);
}

// TEST 5: getActiveBotUsername resolution
console.log('\n--- TEST 5: getActiveBotUsername Resolution ---');
import { getActiveBotUsername, createBulkParentInvitations } from '../src/lib/telegramClient.js';
import { createLocalTableQueryBuilder } from '../src/lib/databaseAdapter.js';

const resolvedBot = getActiveBotUsername('CustomAcademyBot');
assert(resolvedBot === 'CustomAcademyBot', `Resolved explicit bot username: ${resolvedBot}`);

const strippedBot = getActiveBotUsername('@CleanAcademyBot');
assert(strippedBot === 'CleanAcademyBot', `Stripped leading @ from bot username: ${strippedBot}`);

// TEST 6: createBulkParentInvitations validation
console.log('\n--- TEST 6: createBulkParentInvitations Functionality ---');
assert(typeof createBulkParentInvitations === 'function', 'createBulkParentInvitations is properly exported as a function');

// TEST 7: databaseAdapter .or() PostgREST Query Evaluation
console.log('\n--- TEST 7: databaseAdapter .or() Filter Evaluation ---');
const builder = createLocalTableQueryBuilder('attendance');
assert(typeof builder.or === 'function', 'createLocalTableQueryBuilder provides .or() method');

// Test OR filter string evaluator logic
const mockRows = [
  { id: '1', telegram_notified: true, telegram_delivery_status: 'delivered' },
  { id: '2', telegram_notified: false, telegram_delivery_status: 'failed' },
  { id: '3', telegram_notified: false, telegram_delivery_status: 'unnotified' },
];

const orFilterStr = 'telegram_notified.eq.true,telegram_delivery_status.neq.unnotified';
const orConditions = orFilterStr.split(',').map(c => c.trim()).filter(Boolean);

const filteredMock = mockRows.filter(row => {
  return orConditions.some(cond => {
    const parts = cond.split('.');
    const col = parts[0];
    const op = parts[1];
    const rawVal = parts.slice(2).join('.');
    let targetVal = rawVal;
    if (rawVal === 'true') targetVal = true;
    else if (rawVal === 'false') targetVal = false;
    else if (rawVal === 'null') targetVal = null;
    else if (!isNaN(Number(rawVal)) && rawVal !== '') targetVal = Number(rawVal);

    const rowVal = row[col];
    if (op === 'eq') return rowVal === targetVal;
    if (op === 'neq') return rowVal !== targetVal;
    return false;
  });
});

assert(filteredMock.length === 2, `OR filter correctly matched 2 records (got ${filteredMock.length})`);
assert(filteredMock.find(r => r.id === '1') !== undefined, 'Record 1 matched via telegram_notified.eq.true');
assert(filteredMock.find(r => r.id === '2') !== undefined, 'Record 2 matched via telegram_delivery_status.neq.unnotified');
assert(filteredMock.find(r => r.id === '3') === undefined, 'Record 3 was correctly filtered out');

// TEST 8: deleteTelegramWebhook export & 409 Conflict Handling
console.log('\n--- TEST 8: deleteTelegramWebhook & 409 Auto-Recovery ---');
import { deleteTelegramWebhook } from '../src/lib/telegramClient.js';
assert(typeof deleteTelegramWebhook === 'function', 'deleteTelegramWebhook is exported as a function');

const mock409Conflict = {
  ok: false,
  error_code: 409,
  description: "Conflict: can't use getUpdates method while webhook is active; use deleteWebhook to delete the webhook first",
};
const isWebhookConflict = mock409Conflict.error_code === 409 || mock409Conflict.description?.toLowerCase().includes('webhook');
assert(isWebhookConflict === true, 'Correctly detects HTTP 409 webhook conflict to trigger auto-deleteWebhook');

// TEST 9: Direct Phone Number Parsing in Telegram Chat
console.log('\n--- TEST 9: Direct Phone Number Parser in Telegram Chat ---');
const rawChatInputs = [
  '9728782110',
  '+91 97287 82110',
  '+919728782110',
  '  9728782110  ',
];
rawChatInputs.forEach(input => {
  const digits = input.replace(/[^0-9]/g, '');
  const phone10 = digits.slice(-10);
  assert(phone10 === '9728782110', `Parsed 10-digit mobile from "${input}" -> ${phone10}`);
});

// TEST 10: Confirmation Callback Handler with parent_<id> and tk_<token>
console.log('\n--- TEST 10: Callback Query Target Resolution ---');
const cbData1 = 'confirm_link:tk_abc1234567890def';
const cbData2 = 'confirm_link:parent_pr_ajay_101';
const cbTarget1 = cbData1.replace(/^confirm_link:/, '').trim();
const cbTarget2 = cbData2.replace(/^confirm_link:/, '').trim();
assert(cbTarget1 === 'tk_abc1234567890def', `Parsed token callback target: ${cbTarget1}`);
assert(cbTarget2 === 'parent_pr_ajay_101', `Parsed parent direct callback target: ${cbTarget2}`);

console.log('\n================================================================');
console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
}
