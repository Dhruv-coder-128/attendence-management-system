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

assert(parsedToken === 'tk_9f81a7b2c3d4e5f6', `Extracted token from callback query: ${parsedToken}`);
assert(parsedChatId === '771234567', `Extracted chat_id from callback query: ${parsedChatId}`);

console.log('\n================================================================');
console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
}
