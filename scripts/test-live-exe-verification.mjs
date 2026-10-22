// Complete automated verification of live SMS-App.exe native LAN Hub
import { spawn } from 'child_process';
import path from 'path';

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testLiveExe() {
  const exePath = path.resolve('release-exe', 'SMS-App.exe');
  console.log('Launching SMS-App.exe from:', exePath);

  const proc = spawn(exePath, [], {
    detached: true,
    stdio: 'ignore'
  });

  const base = 'http://127.0.0.1:5173/api/local-hub';
  let ready = false;
  let statusData = null;

  // Poll for hub to be ready
  for (let i = 0; i < 25; i++) {
    await wait(600);
    try {
      const res = await fetch(`${base}?action=status`);
      if (res.ok) {
        statusData = await res.json();
        if (statusData.ok) {
          ready = true;
          break;
        }
      }
    } catch (e) {
      // still starting up
    }
  }

  if (!ready || !statusData) {
    try { proc.kill(); } catch {}
    throw new Error('SMS-App.exe failed to start native LAN Hub within 15 seconds.');
  }

  console.log('\n--- LIVE EXE NATIVE HUB ONLINE ---');
  const pass1 = statusData.ok && statusData.service.includes('Wi-Fi') && statusData.localIp && statusData.port > 0;
  console.log(`[Test 1] Status Endpoint: ${pass1 ? 'PASS' : 'FAIL'}`);
  console.log(`         IP: ${statusData.localIp}, Port: ${statusData.port}, URL: ${statusData.connectUrl}, Token: ${statusData.token}`);
  const token = statusData.token;

  // 2. Batches Check
  const batchRes = await fetch(`${base}?action=batches`);
  const batchData = await batchRes.json();
  const pass2 = batchData.ok && Array.isArray(batchData.batches) && batchData.count > 0;
  console.log(`[Test 2] Batches Endpoint: ${pass2 ? 'PASS' : 'FAIL'} (Count: ${batchData.count})`);

  // 3. Students Check & Strict Batch Filtering Check
  const stuRes = await fetch(`${base}?action=students`);
  const stuData = await stuRes.json();
  const pass3a = stuData.ok && Array.isArray(stuData.students) && stuData.count > 0;

  const targetBatch = batchData.batches[0]?.id || 'B11';
  const batchStuRes = await fetch(`${base}?action=students&batch_id=${encodeURIComponent(targetBatch)}`);
  const batchStuData = await batchStuRes.json();
  const pass3b = batchStuData.ok && batchStuData.count > 0 && batchStuData.count < stuData.count;
  const pass3 = pass3a && pass3b;
  console.log(`[Test 3] Students Endpoint: ${pass3 ? 'PASS' : 'FAIL'} (Total: ${stuData.count}, In Batch ${targetBatch}: ${batchStuData.count} - strictly isolated)`);

  // 4. Submit Attendance with Present, Late, Absent
  const testDate = '2026-10-19';
  const testStudents = batchStuData.students.slice(0, 3);
  const attPayload = {
    action: 'attendance',
    batch_id: targetBatch,
    date: testDate,
    records: [
      { student_id: testStudents[0].id, admission_no: testStudents[0].admission_no, status: 'Present' },
      { student_id: testStudents[1].id, admission_no: testStudents[1].admission_no, status: 'Late' },
      { student_id: testStudents[2].id, admission_no: testStudents[2].admission_no, status: 'Absent' }
    ]
  };

  const saveRes = await fetch(`${base}?action=attendance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Token': token },
    body: JSON.stringify(attPayload)
  });
  const saveData = await saveRes.json();
  const pass4 = saveData.ok && saveData.saved === 3 && saveData.presentCount === 1 && saveData.lateCount === 1 && saveData.absentCount === 1;
  console.log(`[Test 4] Save Attendance (Present/Late/Absent): ${pass4 ? 'PASS' : 'FAIL'}`);
  console.log(`         Saved: ${saveData.saved}, Msg: "${saveData.message}"`);

  // 5. Query saved attendance
  const queryRes = await fetch(`${base}?action=attendance&batch_id=${encodeURIComponent(targetBatch)}&date=${testDate}`);
  const queryData = await queryRes.json();
  const pass5 = queryData.ok && queryData.total === 3 && queryData.presentCount === 1 && queryData.lateCount === 1 && queryData.absentCount === 1;
  console.log(`[Test 5] Query Attendance Records: ${pass5 ? 'PASS' : 'FAIL'}`);
  console.log(`         Total: ${queryData.total}, Present: ${queryData.presentCount}, Late: ${queryData.lateCount}, Absent: ${queryData.absentCount}`);

  // 6. Test Deduplication
  const dedupRes = await fetch(`${base}?action=attendance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Token': token },
    body: JSON.stringify(attPayload)
  });
  const dedupData = await dedupRes.json();
  const verifyDedup = await (await fetch(`${base}?action=attendance&batch_id=${encodeURIComponent(targetBatch)}&date=${testDate}`)).json();
  const pass6 = verifyDedup.total === 3;
  console.log(`[Test 6] Deduplication on Re-submission: ${pass6 ? 'PASS' : 'FAIL'} (Records remain: ${verifyDedup.total})`);

  // 7. Test Updates endpoint
  const updatesRes = await fetch(`${base}?action=updates&date=${testDate}&batch_id=${encodeURIComponent(targetBatch)}`);
  const updatesData = await updatesRes.json();
  const pass7 = updatesData.ok && updatesData.records.length === 3;
  console.log(`[Test 7] Desktop Updates Endpoint: ${pass7 ? 'PASS' : 'FAIL'} (Updates Count: ${updatesData.records.length})`);

  // 8. Test Cross-Restart Persistence (Req 7)
  console.log('\n[Test 8] Terminating SMS-App.exe and re-launching to verify persistent disk state...');
  try { process.kill(proc.pid); } catch {}
  await wait(1200);

  const proc2 = spawn(exePath, [], { detached: true, stdio: 'ignore' });
  let restarted = false;
  let restartAttData = null;
  for (let i = 0; i < 20; i++) {
    await wait(600);
    try {
      const res = await fetch(`${base}?action=attendance&batch_id=${encodeURIComponent(targetBatch)}&date=${testDate}`);
      if (res.ok) {
        restartAttData = await res.json();
        if (restartAttData.ok && restartAttData.total === 3) {
          restarted = true;
          break;
        }
      }
    } catch {}
  }

  const pass8 = restarted && restartAttData && restartAttData.total === 3;
  console.log(`[Test 8] Cross-Restart Persistence: ${pass8 ? 'PASS' : 'FAIL'} (Records loaded from disk: ${restartAttData?.total || 0})`);

  try { process.kill(proc2.pid); } catch {}

  const allPassed = pass1 && pass2 && pass3 && pass4 && pass5 && pass6 && pass7 && pass8;
  console.log('\n=============================================');
  console.log(`LIVE EXE VERIFICATION RESULT: ${allPassed ? 'ALL TESTS PASSED (8/8)' : 'FAILURES DETECTED'}`);
  console.log('=============================================\n');

  if (!allPassed) {
    process.exit(1);
  }
}

testLiveExe().catch((err) => {
  console.error(err);
  process.exit(1);
});

