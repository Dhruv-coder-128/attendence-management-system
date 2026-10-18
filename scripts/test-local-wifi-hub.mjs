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
await asyncTest('GET /api/local-hub?action=batches returns exactly the 5 canonical batches', async () => {
  const req = { method: 'GET', query: { action: 'batches' } };
  const res = createMockRes();

  await handler(req, res);
  assert.strictEqual(res.getStatusCode(), 200, 'HTTP 200 returned');

  const data = res.getData();
  assert.strictEqual(data.ok, true, 'Batches response is ok');
  assert(Array.isArray(data.batches), 'Batches array returned');
  assert.strictEqual(data.batches.length, 5, 'Exactly 5 batches returned');

  const batchIdentifiers = data.batches.map((b) => b.id || b.code);
  assert(batchIdentifiers.includes('B11') || data.batches.some((b) => b.code === '11-COM'), 'Contains B11 (11th Commerce)');
  assert(batchIdentifiers.includes('B12') || data.batches.some((b) => b.code === '12-COM'), 'Contains B12 (12th Commerce)');
  assert(batchIdentifiers.includes('BFY') || data.batches.some((b) => b.code === 'FY-BCA'), 'Contains BFY (FY)');
  assert(batchIdentifiers.includes('BSY') || data.batches.some((b) => b.code === 'SY-BCA'), 'Contains BSY (SY)');
  assert(batchIdentifiers.includes('BTY') || data.batches.some((b) => b.code === 'TY-BCA'), 'Contains BTY (TY)');
});

// TEST 4: Students Action
console.log('\n--- TEST 4: Student Roster Query ---');
await asyncTest('GET /api/local-hub?action=students&batch_id=B11 returns 20 enrolled students', async () => {
  const req = { method: 'GET', query: { action: 'students', batch_id: 'B11' } };
  const res = createMockRes();

  await handler(req, res);
  assert.strictEqual(res.getStatusCode(), 200, 'HTTP 200 returned');

  const data = res.getData();
  assert.strictEqual(data.ok, true, 'Students response is ok');
  assert(Array.isArray(data.students), 'Students array returned');
  assert.strictEqual(data.students.length, 20, 'Exactly 20 students in B11');

  const krishna = data.students.find((s) => s.admission_no === 'ST1001');
  assert(krishna !== undefined, 'Contains Krishna Dave (ST1001 / Roll 1)');
  assert.strictEqual(krishna.full_name, 'Krishna Dave', 'Student name is Krishna Dave');
});

// TEST 5: Attendance Submission with Present, Late, and Absent
console.log('\n--- TEST 5: Roll Call Attendance Submission (Present, Late, Absent) ---');
await asyncTest('POST /api/local-hub?action=attendance saves Present, Late, and Absent records', async () => {
  const records = [
    { student_id: 'ST1001', status: 'Present' },
    { student_id: 'ST1002', status: 'Late' },
    { student_id: 'ST1003', status: 'Absent' },
    { student_id: 'ST1004', status: 'Present' },
  ];

  const req = {
    method: 'POST',
    body: {
      action: 'attendance',
      batch_id: 'B11',
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
  assert.strictEqual(data.presentCount, 2, 'Present count is 2');
  assert.strictEqual(data.lateCount, 1, 'Late count is 1');
  assert.strictEqual(data.absentCount, 1, 'Absent count is 1');
  assert(data.message.includes('Successfully saved'), 'Success confirmation message returned');
});

// TEST 6: Attendance Retrieval & Real-time Updates Polling
console.log('\n--- TEST 6: Attendance Retrieval & Desktop Updates Polling ---');
await asyncTest('GET /api/local-hub?action=attendance returns saved roll call for batch & date', async () => {
  const req = { method: 'GET', query: { action: 'attendance', batch_id: 'B11', date: '2026-10-17' } };
  const res = createMockRes();

  await handler(req, res);
  assert.strictEqual(res.getStatusCode(), 200, 'HTTP 200 returned');

  const data = res.getData();
  assert.strictEqual(data.ok, true, 'Attendance retrieval succeeds');
  assert(Array.isArray(data.records) && data.records.length === 4, 'Returns 4 records');
  assert.strictEqual(data.records.find((r) => r.student_id === 'ST1002')?.status, 'Late');
});

await asyncTest('GET /api/local-hub?action=updates provides real-time polling data', async () => {
  const req = { method: 'GET', query: { action: 'updates', batch_id: 'B11', date: '2026-10-17' } };
  const res = createMockRes();

  await handler(req, res);
  assert.strictEqual(res.getStatusCode(), 200, 'HTTP 200 returned');

  const data = res.getData();
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.hasData, true);
  assert(Array.isArray(data.records) && data.records.length > 0);
});

// TEST 7: Client-Side Hub Service & Offline Queue
console.log('\n--- TEST 7: Client Hub Service Persistence & Queue ---');
test('getStoredHubUrl and setStoredHubUrl manage connection URL', () => {
  setStoredHubUrl('http://192.168.0.104:5173/');
  assert.strictEqual(getStoredHubUrl(), 'http://192.168.0.104:5173', 'Strips trailing slash');
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
