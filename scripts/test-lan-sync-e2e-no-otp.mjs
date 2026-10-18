// Comprehensive E2E test simulating Android Teacher Attendance App saving roll call
// with NO TOKEN and NO OTP over LAN IP (192.168.31.196)

async function testMobileLanSync() {
  // First query local loopback to discover the dynamically active LAN IP
  const localRes = await fetch('http://127.0.0.1:5173/api/local-hub?action=status');
  const localStatus = await localRes.json();
  const lanIp = localStatus.localIp || '127.0.0.1';
  const lanBase = `http://${lanIp}:5173/api/local-hub`;

  console.log('Testing Mobile LAN Sync against LAN IP:', lanBase);

  // 1. Check status over real LAN IP
  const statusRes = await fetch(`${lanBase}?action=status`);
  const status = await statusRes.json();
  console.log('[1] Hub Status:', status.ok ? 'ONLINE' : 'OFFLINE', 'IP:', status.localIp);
  if (!status.ok) throw new Error('Hub offline');

  // 2. Fetch students for 11th Commerce
  const stuRes = await fetch(`${lanBase}?action=students&batch_id=11-COM`);
  const stuData = await stuRes.json();
  console.log('[2] Fetched students for 11-COM:', stuData.count);

  if (stuData.count === 0) {
    throw new Error('No students returned for 11-COM');
  }

  // 2b. Verify OPTIONS CORS Preflight allows X-Device-Id
  console.log('[2b] Testing OPTIONS CORS Preflight...');
  const optRes = await fetch(`${lanBase}?action=attendance`, {
    method: 'OPTIONS',
    headers: {
      'Origin': 'http://localhost',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type, x-device-id'
    }
  });
  const allowHeaders = optRes.headers.get('access-control-allow-headers') || '';
  console.log('    OPTIONS Status:', optRes.status, 'Allow-Headers:', allowHeaders);
  if (!allowHeaders.toLowerCase().includes('x-device-id') && !allowHeaders.includes('*')) {
    throw new Error('OPTIONS preflight missing X-Device-Id in Access-Control-Allow-Headers');
  }
  console.log('✓ OPTIONS CORS Preflight verified successfully!');

  // 3. Mark all 20 students ABSENT (matching user scenario from screenshot)
  const today = '2026-10-18';
  const records = stuData.students.map(s => ({
    student_id: s.id,
    admission_no: s.admission_no,
    roll_no: s.roll_no,
    full_name: s.full_name || s.name,
    status: 'Absent',
    remarks: 'Marked from Android App over Wi-Fi',
    time_in: '18:10'
  }));

  const payload = {
    action: 'attendance',
    batch_id: '11-COM',
    batch_code: '11-COM',
    batch_name: '11th Commerce',
    date: today,
    records: records,
    device_id: 'android-phone-realme-test-no-otp'
  };

  console.log('[3] Sending POST /attendance from phone (NO TOKEN, NO OTP)...');
  const postRes = await fetch(`${lanBase}?action=attendance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': 'android-phone-realme-test-no-otp'
      // Notice: NO X-Hub-Token! Zero friction!
    },
    body: JSON.stringify(payload)
  });

  console.log('    Response HTTP Status:', postRes.status);
  const postData = await postRes.json();
  console.log('    Response JSON:', JSON.stringify(postData));

  if (postRes.status === 401 || !postData.ok) {
    throw new Error(`Failed to save attendance! Error: ${postData.error || postRes.status}`);
  }

  console.log('✓ POST succeeded with 200 OK! Saved:', postData.saved, 'Absent:', postData.absentCount);

  // 4. Verify querying attendance with 11-COM alias
  const queryRes1 = await fetch(`${lanBase}?action=attendance&batch_id=11-COM&date=${today}`);
  const data1 = await queryRes1.json();
  console.log('[4] Query by 11-COM:', data1.ok, 'Total:', data1.total, 'Absent:', data1.absentCount);

  // 5. Verify querying attendance with canonical B11 alias
  const queryRes2 = await fetch(`${lanBase}?action=attendance&batch_id=B11&date=${today}`);
  const data2 = await queryRes2.json();
  console.log('[5] Query by B11:', data2.ok, 'Total:', data2.total, 'Absent:', data2.absentCount);

  if (data1.total !== 20 || data2.total !== 20 || data1.absentCount !== 20) {
    throw new Error('Attendance count mismatch or alias resolution failed');
  }

  // 6. Verify PC updates poll
  const updatesRes = await fetch(`${lanBase}?action=updates&date=${today}&batch_id=11-COM`);
  const updatesData = await updatesRes.json();
  console.log('[6] PC updates feed:', updatesData.ok, 'Records:', updatesData.records?.length);

  if (!updatesData.ok || updatesData.records?.length !== 20) {
    throw new Error('PC updates feed failed');
  }

  console.log('\n=============================================');
  console.log('ALL E2E MOBILE LAN ATTENDANCE SYNC TESTS PASSED (100%)');
  console.log('=============================================\n');
}

testMobileLanSync().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
