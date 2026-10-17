/**
 * Automated Verification Suite for:
 * 1. Parent Portal Mobile PWA Service
 * 2. Multi-Child Sibling Resolution & Switching
 * 3. Attendance Heatmap Computation
 * 4. Exam Marksheet & Batch Rank Percentile Engine
 * 5. PWA Manifest Configuration
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${description}`);
    console.error(err);
    failed++;
  }
}

async function asyncTest(description, fn) {
  try {
    await fn();
    console.log(`  ✓ PASS: ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${description}`);
    console.error(err);
    failed++;
  }
}

console.log('======================================================');
console.log('PARENT PORTAL PWA & SIBLING SUPPORT TEST SUITE');
console.log('======================================================\n');

// Mock localStorage and window for Node environment
const storage = {};
global.localStorage = {
  getItem: (key) => storage[key] || null,
  setItem: (key, val) => { storage[key] = String(val); },
  removeItem: (key) => { delete storage[key]; },
  clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
};

global.window = {
  location: { origin: 'https://attendance-management-system-lovat.vercel.app', search: '' },
  addEventListener: () => {},
  removeEventListener: () => {},
};

// TEST 1: PWA Web App Manifest Validation
console.log('--- TEST 1: PWA Web App Manifest Configuration ---');
test('public/manifest.json exists and contains required PWA fields', () => {
  const manifestPath = path.resolve('public/manifest.json');
  assert(fs.existsSync(manifestPath), 'manifest.json exists');
  const raw = fs.readFileSync(manifestPath, 'utf8');
  const json = JSON.parse(raw);
  assert(json.name, 'manifest has name');
  assert.strictEqual(json.display, 'standalone', 'PWA display is standalone');
  assert(json.start_url.includes('portal=parent'), 'start_url targets parent portal');
  assert(Array.isArray(json.icons) && json.icons.length > 0, 'manifest defines icons');
});

// TEST 2: Phone and Identifier Normalization
console.log('\n--- TEST 2: Parent Portal Utilities Normalization ---');
import {
  cleanPhone,
  cleanIdentifier,
  saveParentPortalSession,
  getParentPortalSession,
  clearParentPortalSession,
  buildParentPortalLink,
  authenticateParent,
  fetchStudentAttendanceSummary,
  fetchStudentExamsWithRank,
  getDailyClassDiary,
} from '../src/lib/parentPortalService.js';

test('cleanPhone strips country code and spaces correctly', () => {
  assert.strictEqual(cleanPhone('+91 98765 43210'), '9876543210');
  assert.strictEqual(cleanPhone('98765-43210'), '9876543210');
  assert.strictEqual(cleanPhone('8866039007'), '8866039007');
});

test('cleanIdentifier normalizes roll and admission numbers', () => {
  assert.strictEqual(cleanIdentifier('  ADM-2026-001  '), 'adm-2026-001');
  assert.strictEqual(cleanIdentifier(' 101 '), '101');
});

test('buildParentPortalLink creates correct mobile URL with query parameters', () => {
  const link = buildParentPortalLink({ phone: '9876543210' }, { admission_no: 'ADM-001' });
  assert(link.includes('portal=parent'));
  assert(link.includes('phone=9876543210'));
  assert(link.includes('adm=ADM-001'));
});

// TEST 3: Multi-Child Sibling Authentication & Resolution
console.log('\n--- TEST 3: Parent Authentication & Sibling Resolution ---');
await asyncTest('authenticateParent verifies parent and resolves multiple enrolled siblings', async () => {
  const res = await authenticateParent('9876543210', '101');
  assert.strictEqual(res.ok, true, 'Authentication succeeds');
  assert(res.students.length >= 2, 'Detects both siblings (Aarav and Diya)');
  
  const studentNames = res.students.map((s) => s.full_name);
  assert(studentNames.includes('Aarav Sharma'), 'Contains child 1 Aarav');
  assert(studentNames.includes('Diya Sharma'), 'Contains sibling child 2 Diya');

  // Verify active student selection
  assert.strictEqual(res.selectedStudentId, 'demo-student-01', 'Active student matched identifier');
});

await asyncTest('authenticateParent validates user case: 8866039007 + Roll 19 (Dhruv Shah / Uday shah)', async () => {
  const res = await authenticateParent('+91 8866039007', '19');
  assert.strictEqual(res.ok, true, 'Authentication succeeds for 8866039007 + 19');
  assert.strictEqual(res.parent.full_name, 'Uday shah', 'Resolved parent is Uday shah');
  assert.strictEqual(res.students[0].full_name, 'Dhruv Shah', 'Resolved student is Dhruv Shah');
  assert.strictEqual(res.students[0].admission_no, 'ST1019', 'Admission number is ST1019');
  assert.strictEqual(res.students[0].roll_no, '19', 'Roll number is 19');
});

await asyncTest('authenticateParent validates admission number match: 8866039007 + ST1019', async () => {
  const res = await authenticateParent('8866039007', 'ST1019');
  assert.strictEqual(res.ok, true, 'Authentication succeeds for 8866039007 + ST1019');
  assert.strictEqual(res.students[0].roll_no, '19', 'Correct roll number');
});

await asyncTest('authenticateParent rejects mismatched roll number for verified phone', async () => {
  const res = await authenticateParent('8866039007', '999');
  assert.strictEqual(res.ok, false, 'Authentication correctly rejected for wrong roll number');
  assert(res.error.includes('roll number'), 'Informs user that roll number does not match');
});

test('Parent session persists in localStorage and clears on logout', () => {
  const session = getParentPortalSession();
  assert(session !== null, 'Session is persisted');
  assert(session.students.length >= 1, 'Persists student list');

  clearParentPortalSession();
  assert.strictEqual(getParentPortalSession(), null, 'Session cleanly cleared on logout');
});

// TEST 4: Attendance Heatmap & Monthly Calculation
console.log('\n--- TEST 4: Attendance Heatmap & Matrix Computation ---');
await asyncTest('fetchStudentAttendanceSummary builds date-by-date matrix and rates', async () => {
  const att = await fetchStudentAttendanceSummary('demo-student-01');
  assert(att !== null, 'Attendance summary exists');
  assert(att.records.length > 0, 'Contains attendance records');
  assert(att.heatmap, 'Generates day-by-day heatmap dictionary');
  assert(typeof att.stats.rate === 'number', 'Calculates percentage attendance rate');
  assert(Array.isArray(att.monthlyRates), 'Generates monthly breakdown rates');
});

// TEST 5: Exam Report Card & Batch Rank Calculation
console.log('\n--- TEST 5: Exam Marksheet & Batch Ranking Engine ---');
await asyncTest('fetchStudentExamsWithRank calculates score and batch rank badge', async () => {
  const exams = await fetchStudentExamsWithRank('demo-student-01', 'batch-11-sci');
  assert(exams.length > 0, 'Contains test records');
  
  const test1 = exams[0];
  assert(test1.title, 'Exam has title');
  assert.strictEqual(typeof test1.rank, 'number', 'Computes batch rank number');
  assert(test1.rank <= test1.totalStudents, 'Rank is within total batch students');
  assert(test1.percentile >= 0 && test1.percentile <= 100, 'Computes percentile');
  assert(test1.marks_obtained <= test1.max_marks, 'Valid marks score');
});

// TEST 6: Daily Class Diary & DPP Homework
console.log('\n--- TEST 6: Daily Class Diary Feed ---');
test('getDailyClassDiary provides daily topics, homework and worksheet attachments', () => {
  const diary = getDailyClassDiary('batch-11-sci');
  assert(diary.length > 0, 'Contains diary entries');
  assert(diary[0].subject, 'Diary has subject');
  assert(diary[0].topicCovered, 'Diary lists topic covered');
  assert(diary[0].homework, 'Diary lists homework assignment');
  assert(diary[0].attachmentName, 'Diary includes worksheet attachment');
});

console.log('\n======================================================');
console.log(`SUITE FINISHED: ${passed} Passed, ${failed} Failed`);
console.log('======================================================');

if (failed > 0) {
  process.exit(1);
}
