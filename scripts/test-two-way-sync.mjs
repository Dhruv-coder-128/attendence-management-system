import fs from 'fs';
import path from 'path';
import handler from '../api/local-hub.js';

async function runTests() {
  console.log('====================================================');
  console.log('STARTING TWO-WAY WI-FI DATABASE SYNCHRONIZATION TESTS');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, testName) {
    total++;
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      process.exitCode = 1;
    }
  }

  // Helper to call api/local-hub handler directly
  async function callHub(query = {}, body = {}, method = 'GET') {
    let result = null;
    let statusCode = 200;
    const req = { query, body, method, headers: {} };
    const res = {
      setHeader: () => {},
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => { result = data; },
          end: () => {},
        };
      },
    };
    await handler(req, res);
    return { status: statusCode, data: result };
  }

  // 1. Verify school_database.json exists on disk
  const dbPath = path.resolve('src/data/school_database.json');
  assert(fs.existsSync(dbPath), 'src/data/school_database.json exists on disk');

  const rawDb = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  assert(Array.isArray(rawDb.batches) && rawDb.batches.length === 5, 'Contains exactly 5 batches');
  assert(Array.isArray(rawDb.students) && rawDb.students.length === 100, 'Contains exactly 100 students');

  // 2. Verify ST1001 Krishna Dave is in 11th Commerce and ST1061 Saanvi Vora is in SY
  const krishna = rawDb.students.find(s => s.id === 'ST1001');
  assert(Boolean(krishna), 'Student ST1001 Krishna Dave exists in database');
  assert(krishna?.batch_id === 'B11', 'Krishna Dave batch_id is "B11"');
  assert(krishna?.batch_name === '11th Commerce', 'Krishna Dave batch_name is "11th Commerce"');

  const saanvi = rawDb.students.find(s => s.id === 'ST1061');
  assert(Boolean(saanvi), 'Student ST1061 Saanvi Vora exists in database');
  assert(saanvi?.batch_id === 'BSY', 'Saanvi Vora batch_id is "BSY" (SY)');
  assert(saanvi?.batch_name === 'SY', 'Saanvi Vora batch_name is "SY"');

  // 3. Query students for 11th Commerce (B11) via Hub API
  const resB11 = await callHub({ action: 'students', batch_id: 'B11' });
  assert(resB11.status === 200 && resB11.data?.ok, 'Hub API returns 200 for batch B11');
  assert(resB11.data?.students?.length === 20, 'Hub API returns exactly 20 students for B11');
  assert(resB11.data?.students?.some(s => s.id === 'ST1001'), 'Hub API includes Krishna Dave in B11');

  // 4. Query students for 11th Commerce by name via Hub API
  const resB11Name = await callHub({ action: 'students', batch_id: '11th Commerce' });
  assert(resB11Name.data?.students?.length === 20, 'Hub API returns 20 students for "11th Commerce" query');
  assert(resB11Name.data?.students?.some(s => s.id === 'ST1001'), 'Hub API includes Krishna Dave when querying by name');

  // 5. Query students for SY (BSY) via Hub API
  const resSY = await callHub({ action: 'students', batch_id: 'BSY' });
  assert(resSY.data?.students?.length === 20, 'Hub API returns exactly 20 students for SY');
  assert(resSY.data?.students?.some(s => s.id === 'ST1061'), 'Hub API includes Saanvi Vora in SY');

  // 6. Test Two-Way PC -> Hub Data Sync (sync_school_data)
  const modifiedStudents = rawDb.students.map(s => {
    if (s.id === 'ST1001') {
      return { ...s, contact_number: '981349847-UPDATED' };
    }
    return s;
  });

  const syncRes = await callHub(
    { action: 'sync_school_data' },
    { students: modifiedStudents },
    'POST'
  );
  assert(syncRes.status === 200 && syncRes.data?.ok, 'POST sync_school_data succeeds');

  // Verify Hub immediately serves updated contact to phone
  const recheckB11 = await callHub({ action: 'students', batch_id: 'B11' });
  const updatedKrishna = recheckB11.data?.students?.find(s => s.id === 'ST1001');
  assert(updatedKrishna?.contact_number === '981349847-UPDATED', 'Hub immediately reflects PC student edit');

  // Revert contact number
  await callHub(
    { action: 'sync_school_data' },
    { students: rawDb.students },
    'POST'
  );

  // 7. Test Mobile -> PC Attendance Sync
  const testDate = '2026-10-18';
  const attRes = await callHub(
    { action: 'attendance' },
    {
      batch_id: 'B11',
      batch_code: 'B11',
      batch_name: '11th Commerce',
      date: testDate,
      records: [
        { student_id: 'ST1061', admission_no: 'ST1061', roll_no: 1, status: 'Present' },
        { student_id: 'ST1002', admission_no: 'ST1002', roll_no: 2, status: 'Absent' },
      ],
    },
    'POST'
  );
  assert(attRes.status === 200 && attRes.data?.ok, 'Mobile attendance submission succeeds');
  assert(attRes.data?.presentCount === 1, 'Attendance correctly records 1 Present');
  assert(attRes.data?.absentCount === 1, 'Attendance correctly records 1 Absent');

  // 8. Test PC polling endpoint (updates) receives mobile roll call
  const updateRes = await callHub({ action: 'updates', date: testDate, batch_id: 'B11' });
  assert(updateRes.data?.ok && updateRes.data?.hasData, 'PC polling receives live data from phone');
  assert(updateRes.data?.records?.some(r => r.admission_no === 'ST1061' && r.status === 'Present'), 'ST1061 received as Present on PC');
  assert(updateRes.data?.records?.some(r => r.admission_no === 'ST1002' && r.status === 'Absent'), 'ST1002 received as Absent on PC');

  console.log('\n====================================================');
  console.log(`SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
