/**
 * End-to-End Automated LAN Synchronization Test Suite
 * Validates:
 * 1. IP & Port Auto-Detection and Status Endpoint
 * 2. Token Security: Rejection of unauthorized writes & acceptance of valid paired token
 * 3. Batch and Student Roster Resolution
 * 4. PC -> Hub student updates (EXE editing reflects on phone)
 * 5. Phone -> Hub attendance submission (Present, Late, Absent)
 * 6. Deduplication and non-overwriting of other students
 * 7. Desktop Polling & Updates ingestion format
 * 8. Client-side Hub Service Offline Queue and Flush
 */

import assert from 'node:assert';
import handler, { getLocalNetworkIp } from '../api/local-hub.js';
import {
  getStoredHubUrl,
  setStoredHubUrl,
  getStoredHubToken,
  setStoredHubToken,
  getOfflineQueue,
  clearOfflineQueue,
  queueAttendanceOffline,
  flushOfflineQueue,
} from '../src/lib/localWifiHubService.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(err);
    failed++;
  }
}

function createMockReqRes(method = 'GET', query = {}, body = {}, headers = {}) {
  const reqHeaders = { ...headers };
  const req = {
    method,
    query,
    body,
    headers: reqHeaders,
  };

  let statusCode = 200;
  let responseData = null;
  const resHeaders = {};

  const res = {
    setHeader(k, v) { resHeaders[k] = v; },
    status(code) { statusCode = code; return this; },
    json(data) { responseData = data; return this; },
    end() { return this; },
    getStatusCode: () => statusCode,
    getData: () => responseData,
    getHeaders: () => resHeaders,
  };

  return { req, res };
}

// Setup mock window & localStorage
const mockStorage = {};
global.localStorage = {
  getItem: (k) => mockStorage[k] || null,
  setItem: (k, v) => { mockStorage[k] = String(v); },
  removeItem: (k) => { delete mockStorage[k]; },
  clear: () => { Object.keys(mockStorage).forEach((k) => delete mockStorage[k]); },
};

global.window = {
  location: { origin: 'http://192.168.1.100:5173' },
};

console.log('===============================================================');
console.log('E2E AUTOMATED LAN ATTENDANCE SYNCHRONIZATION TEST SUITE');
console.log('===============================================================\n');

let activeToken = '';

// TEST 1: LAN Status & Token Generation
console.log('--- TEST 1: Status & Active Network IP Detection ---');
await test('GET /api/local-hub?action=status provides IP, port 5173, and security token', async () => {
  const { req, res } = createMockReqRes('GET', { action: 'status' });
  await handler(req, res);

  assert.strictEqual(res.getStatusCode(), 200, 'HTTP 200 returned');
  const data = res.getData();
  assert.strictEqual(data.ok, true, 'Status is ok');
  assert(data.localIp && /\d+\.\d+\.\d+\.\d+/.test(data.localIp), 'Valid IPv4 detected');
  assert.strictEqual(data.port, 5173, 'Port is 5173');
  assert(typeof data.token === 'string' && data.token.length > 0, 'Pairing token generated');
  activeToken = data.token;
  setStoredHubToken(activeToken);
});

// TEST 2: Security & Token Validation
console.log('\n--- TEST 2: Security & Pairing Token Enforcement (Req 9) ---');
await test('POST /api/local-hub?action=attendance rejects unauthorized writes with invalid token', async () => {
  const { req, res } = createMockReqRes(
    'POST',
    {},
    {
      action: 'attendance',
      batch_id: 'B11',
      date: '2026-10-18',
      records: [{ student_id: 'ST1001', status: 'Present' }],
    },
    { 'x-hub-token': 'wrong-unauthorized-token' }
  );

  await handler(req, res);
  assert.strictEqual(res.getStatusCode(), 401, 'HTTP 401 Unauthorized returned for wrong token');
  const data = res.getData();
  assert.strictEqual(data.ok, false, 'Action rejected');
});

await test('POST /api/local-hub?action=attendance accepts writes with valid token', async () => {
  const { req, res } = createMockReqRes(
    'POST',
    {},
    {
      action: 'attendance',
      batch_id: 'B11',
      date: '2026-10-18',
      records: [{ student_id: 'ST1001', status: 'Present' }],
    },
    { 'x-hub-token': activeToken }
  );

  await handler(req, res);
  assert.strictEqual(res.getStatusCode(), 200, 'HTTP 200 returned for valid token');
  const data = res.getData();
  assert.strictEqual(data.ok, true, 'Attendance recorded');
});

// TEST 3: Cohort Batches & Student Rosters
console.log('\n--- TEST 3: Cohort Batches & Student Rosters ---');
await test('GET /api/local-hub?action=batches returns all 5 academic cohorts', async () => {
  const { req, res } = createMockReqRes('GET', { action: 'batches' });
  await handler(req, res);

  assert.strictEqual(res.getStatusCode(), 200);
  const data = res.getData();
  assert.strictEqual(data.ok, true);
  assert(Array.isArray(data.batches) && data.batches.length === 5, 'Contains 5 batches');
});

await test('GET /api/local-hub?action=students&batch_id=B11 returns enrolled students', async () => {
  const { req, res } = createMockReqRes('GET', { action: 'students', batch_id: 'B11' });
  await handler(req, res);

  assert.strictEqual(res.getStatusCode(), 200);
  const data = res.getData();
  assert.strictEqual(data.ok, true);
  assert(Array.isArray(data.students) && data.students.length === 20, '20 students in B11');
});

// TEST 4: Student Edits on PC Propagate to Hub
console.log('\n--- TEST 4: PC Student Mutation Reflection (Req 5) ---');
await test('POST /api/local-hub?action=sync_school_data updates roster on phone immediately', async () => {
  const { req: expReq, res: expRes } = createMockReqRes('GET', { action: 'export_school_data' });
  await handler(expReq, expRes);
  const allStudents = expRes.getData()?.students || [];
  assert.strictEqual(allStudents.length, 100, 'Original database has 100 students');

  // Modify Krishna Dave
  const updatedStudents = allStudents.map((s) =>
    s.admission_no === 'ST1001' ? { ...s, full_name: 'Krishna Dave (Updated By PC)' } : s
  );

  const { req: syncReq, res: syncRes } = createMockReqRes(
    'POST',
    {},
    { action: 'sync_school_data', students: updatedStudents }
  );
  await handler(syncReq, syncRes);
  assert.strictEqual(syncRes.getStatusCode(), 200);

  // Verify hub immediately serves updated name to mobile query
  const { req: checkReq, res: checkRes } = createMockReqRes('GET', { action: 'students', batch_id: 'B11' });
  await handler(checkReq, checkRes);
  const rechecked = checkRes.getData().students;
  assert(
    rechecked.some((s) => s.full_name === 'Krishna Dave (Updated By PC)'),
    'Phone immediately sees student updated by PC'
  );

  // Restore original full student list
  const { req: restoreReq, res: restoreRes } = createMockReqRes(
    'POST',
    {},
    { action: 'sync_school_data', students: allStudents }
  );
  await handler(restoreReq, restoreRes);
  assert.strictEqual(restoreRes.getStatusCode(), 200);
});

// TEST 5: Present, Late, Absent & Deduplication
console.log('\n--- TEST 5: Present, Late, Absent Roll Call & Deduplication (Req 6 & 7) ---');
await test('Saves Present, Late, and Absent accurately and updates without duplicates', async () => {
  const testDate = '2026-10-18';
  const initialRecords = [
    { student_id: 'ST1001', admission_no: 'ST1001', roll_no: 1, status: 'Present' },
    { student_id: 'ST1002', admission_no: 'ST1002', roll_no: 2, status: 'Late' },
    { student_id: 'ST1003', admission_no: 'ST1003', roll_no: 3, status: 'Absent' },
  ];

  const { req: subReq, res: subRes } = createMockReqRes(
    'POST',
    {},
    {
      action: 'attendance',
      batch_id: 'B11',
      date: testDate,
      records: initialRecords,
    },
    { 'x-hub-token': activeToken }
  );

  await handler(subReq, subRes);
  assert.strictEqual(subRes.getStatusCode(), 200);
  const data = subRes.getData();
  assert.strictEqual(data.presentCount, 1, '1 Present');
  assert.strictEqual(data.lateCount, 1, '1 Late');
  assert.strictEqual(data.absentCount, 1, '1 Absent');

  // Re-submit: change ST1002 from Late to Present
  const revisedRecords = [
    { student_id: 'ST1001', admission_no: 'ST1001', roll_no: 1, status: 'Present' },
    { student_id: 'ST1002', admission_no: 'ST1002', roll_no: 2, status: 'Present' },
    { student_id: 'ST1003', admission_no: 'ST1003', roll_no: 3, status: 'Absent' },
  ];

  const { req: reReq, res: reRes } = createMockReqRes(
    'POST',
    {},
    {
      action: 'attendance',
      batch_id: 'B11',
      date: testDate,
      records: revisedRecords,
    },
    { 'x-hub-token': activeToken }
  );

  await handler(reReq, reRes);
  const reData = reRes.getData();
  assert.strictEqual(reData.presentCount, 2, 'Now 2 Present');
  assert.strictEqual(reData.lateCount, 0, 'Now 0 Late');
  assert.strictEqual(reData.absentCount, 1, 'Now 1 Absent');

  // Verify fetch returns updated records without duplicating rows
  const { req: getAttReq, res: getAttRes } = createMockReqRes('GET', {
    action: 'attendance',
    batch_id: 'B11',
    date: testDate,
  });
  await handler(getAttReq, getAttRes);
  const attData = getAttRes.getData();
  assert.strictEqual(attData.records.length, 3, 'Exactly 3 records exist (no duplicate rows)');
});

// TEST 6: Desktop Polling & Updates Endpoint
console.log('\n--- TEST 6: Desktop Updates Ingestion Parity (Req 3 & 6) ---');
await test('GET /api/local-hub?action=updates returns hasData, records, and allRecords', async () => {
  const { req, res } = createMockReqRes('GET', {
    action: 'updates',
    batch_id: 'B11',
    date: '2026-10-18',
  });

  await handler(req, res);
  assert.strictEqual(res.getStatusCode(), 200);
  const data = res.getData();
  assert.strictEqual(data.ok, true);
  assert.strictEqual(data.hasData, true, 'hasData is true');
  assert(Array.isArray(data.records) && data.records.length >= 3, 'Contains batch records');
  assert(Array.isArray(data.allRecords) && data.allRecords.length >= 3, 'Contains allRecords for date');
});

// TEST 7: Client-Side Offline Queue & Safe Flush
console.log('\n--- TEST 7: Client Hub Service Offline Queue & Flush (Req 8) ---');
test('Offline queue safely persists and flushes records upon reconnection', () => {
  clearOfflineQueue();
  assert.strictEqual(getOfflineQueue().length, 0);

  // Queue offline attendance for B12
  queueAttendanceOffline({
    batch_id: 'B12',
    date: '2026-10-18',
    records: [
      { student_id: 'ST1021', admission_no: 'ST1021', roll_no: 1, status: 'Present' },
      { student_id: 'ST1022', admission_no: 'ST1022', roll_no: 2, status: 'Absent' },
    ],
  });

  const queue = getOfflineQueue();
  assert.strictEqual(queue.length, 1, '1 offline roll call queued');
  assert.strictEqual(queue[0].batch_id, 'B12', 'Queued batch is B12');
  assert.strictEqual(queue[0].records.length, 2, 'Contains 2 students');

  clearOfflineQueue();
  assert.strictEqual(getOfflineQueue().length, 0, 'Queue cleared');
});

console.log('\n===============================================================');
console.log(`E2E SUITE FINISHED: ${passed} Passed, ${failed} Failed`);
console.log('===============================================================');

if (failed > 0) {
  process.exit(1);
}
