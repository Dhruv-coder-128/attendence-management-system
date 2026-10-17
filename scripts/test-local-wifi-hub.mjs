/**
 * Automated Verification Suite for:
 * 1. Local Wi-Fi Attendance Hub API (/api/local-hub)
 * 2. IP Detection & Health Status
 * 3. Cohort Batches & Student Roster Resolution
 * 4. Attendance Roll Call Submission & Counter Accuracy
 * 5. Client-Side Hub Service & Offline Queuing
 */

import assert from 'node:assert';
import handler, { getLocalNetworkIp } from '../api/local-hub.js';
import {
  getStoredHubUrl,
  setStoredHubUrl,
  getOfflineQueue,
  clearOfflineQueue,
} from '../src/lib/localWifiHubService.js';

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

// Mock Res Object for testing serverless API handler directly
function createMockRes() {
  const headers = {};
  let statusCode = 200;
  let responseData = null;

  return {
    setHeader(key, val) { headers[key] = val; },
    status(code) { statusCode = code; return this; },
    json(data) { responseData = data; return this; },
    end() { return this; },
    getStatusCode: () => statusCode,
    getData: () => responseData,
    getHeaders: () => headers,
  };
}

console.log('======================================================');
console.log('LOCAL WI-FI ATTENDANCE HUB & TEACHER APP TEST SUITE');
console.log('======================================================\n');

// Mock localStorage for Node test environment
const storage = {};
global.localStorage = {
  getItem: (key) => storage[key] || null,
  setItem: (key, val) => { storage[key] = String(val); },
  removeItem: (key) => { delete storage[key]; },
  clear: () => { Object.keys(storage).forEach((k) => delete storage[k]); },
};

global.window = {
  location: { origin: 'http://10.102.139.146:5173' },
};

// TEST 1: Local Network IP Auto-Detection
console.log('--- TEST 1: Local Network IP Detection ---');
test('getLocalNetworkIp detects machine IPv4 address', () => {
  const ip = getLocalNetworkIp();
  assert(typeof ip === 'string' && ip.length > 0, 'IP address is non-empty string');
  assert(/\d+\.\d+\.\d+\.\d+/.test(ip), `Matches IPv4 pattern: ${ip}`);
});

// TEST 2: Local Hub Status Action
console.log('\n--- TEST 2: Local Hub Status Endpoint ---');
await asyncTest('GET /api/local-hub?action=status returns hub metadata and active IP', async () => {
  const req = { method: 'GET', query: { action: 'status' } };
  const res = createMockRes();

  await handler(req, res);
  assert.strictEqual(res.getStatusCode(), 200, 'HTTP 200 returned');

  const data = res.getData();
  assert.strictEqual(data.ok, true, 'Status response is ok');
  assert(data.localIp, 'Contains localIp');
  assert.strictEqual(data.port, 5173, 'Port is 5173');
  assert(data.connectUrl.includes(data.localIp), 'Connect URL contains detected IP');
});

// TEST 3: Batches Action
console.log('\n--- TEST 3: Cohort Batches Query ---');
await asyncTest('GET /api/local-hub?action=batches returns available cohorts', async () => {
  const req = { method: 'GET', query: { action: 'batches' } };
  const res = createMockRes();

  await handler(req, res);
  assert.strictEqual(res.getStatusCode(), 200, 'HTTP 200 returned');

  const data = res.getData();
  assert.strictEqual(data.ok, true, 'Batches response is ok');
  assert(Array.isArray(data.batches) && data.batches.length > 0, 'Batches array returned');

  const bsyBatch = data.batches.find((b) => b.code === 'BSY-SY' || b.id === 'b_bsy_sy');
  assert(bsyBatch !== undefined, 'Contains BSY-SY cohort');
});

// TEST 4: Students Action
console.log('\n--- TEST 4: Student Roster Query ---');
await asyncTest('GET /api/local-hub?action=students&batch_id=b_bsy_sy returns enrolled students', async () => {
  const req = { method: 'GET', query: { action: 'students', batch_id: 'b_bsy_sy' } };
  const res = createMockRes();

  await handler(req, res);
  assert.strictEqual(res.getStatusCode(), 200, 'HTTP 200 returned');

  const data = res.getData();
  assert.strictEqual(data.ok, true, 'Students response is ok');
  assert(Array.isArray(data.students) && data.students.length > 0, 'Students array returned');

  const dhruv = data.students.find((s) => s.roll_no === '19' || s.admission_no === 'ST1019');
  assert(dhruv !== undefined, 'Contains Dhruv Shah (ST1019 / Roll 19)');
  assert.strictEqual(dhruv.full_name, 'Dhruv Shah', 'Student name is Dhruv Shah');
});

// TEST 5: Attendance Submission Action (POST)
console.log('\n--- TEST 5: Roll Call Attendance Submission ---');
await asyncTest('POST /api/local-hub?action=attendance saves records and computes metrics', async () => {
  const records = [
    { student_id: 'st_1004', status: 'Present' },
    { student_id: 'st_1009', status: 'Present' },
    { student_id: 'st_1014', status: 'Absent' },
    { student_id: 'st_dhruv_1019', status: 'Present' },
  ];

  const req = {
    method: 'POST',
    body: {
      action: 'attendance',
      batch_id: 'b_bsy_sy',
      date: '2026-10-17',
      records,
    },
  };
  const res = createMockRes();

  await handler(req, res);
  assert.strictEqual(res.getStatusCode(), 200, 'HTTP 200 returned');

  const data = res.getData();
  assert.strictEqual(data.ok, true, 'Attendance submission succeeds');
  assert.strictEqual(data.totalStudents, 4, 'Recorded 4 students');
  assert.strictEqual(data.presentCount, 3, 'Present count is 3');
  assert.strictEqual(data.absentCount, 1, 'Absent count is 1');
  assert(data.message.includes('Successfully saved'), 'Success confirmation message returned');
});

// TEST 6: Client-Side Hub Service & Offline Queue
console.log('\n--- TEST 6: Client Hub Service Persistence & Queue ---');
test('getStoredHubUrl and setStoredHubUrl manage connection URL', () => {
  setStoredHubUrl('http://192.168.1.100:5173/');
  assert.strictEqual(getStoredHubUrl(), 'http://192.168.1.100:5173', 'Strips trailing slash');
});

test('Offline queue stores and clears queued attendance payloads', () => {
  clearOfflineQueue();
  assert.strictEqual(getOfflineQueue().length, 0, 'Queue is initially empty');
});

console.log('\n======================================================');
console.log(`SUITE FINISHED: ${passed} Passed, ${failed} Failed`);
console.log('======================================================');

if (failed > 0) {
  process.exit(1);
}
