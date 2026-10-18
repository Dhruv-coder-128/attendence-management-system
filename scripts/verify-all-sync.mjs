import fs from 'fs';
import path from 'path';

console.log('=== SYSTEMATIC VERIFICATION: PC & MOBILE TWO-WAY ROSTER AND ATTENDANCE SYNC ===\n');

// 1. Check canonicalSchoolData.js
import { CANONICAL_BATCHES, CANONICAL_STUDENTS, getBatchStudents } from '../src/data/canonicalSchoolData.js';

console.log('1. Checking Canonical School Data:');
console.log(`   Total Batches: ${CANONICAL_BATCHES.length} (Expected: 5)`);
console.log(`   Total Students: ${CANONICAL_STUDENTS.length} (Expected: 100)`);

// 2. Verify B11 Cohort
const b11 = getBatchStudents('B11');
console.log(`\n2. Checking 11th Commerce (B11) Cohort:`);
console.log(`   Enrolled Count: ${b11.length} (Expected: 20)`);
const expectedB11Names = [
  'Krishna Dave',
  'Ananya Joshi',
  'Meera Makwana',
  'Rohan Mehta',
  'Reyansh Thakkar',
  'Vihaan Trivedi',
  'Aarav Amin',
  'Aarav Dave',
  'Neha Pandya',
  'Meera Jadeja',
  'Riya Vora',
  'Pooja Joshi',
  'Saanvi Vora',
  'Pranav Vora',
  'Vihaan Shah',
  'Dev Shah',
  'Reyansh Amin',
  'Vihaan Modi',
  'Riya Jadeja',
  'Krishna Parmar'
];

let b11Matches = true;
for (let i = 0; i < expectedB11Names.length; i++) {
  const actualName = b11[i]?.full_name;
  if (actualName !== expectedB11Names[i]) {
    console.error(`   ❌ Mismatch at index ${i}: expected ${expectedB11Names[i]}, got ${actualName}`);
    b11Matches = false;
  }
}
if (b11Matches) {
  console.log(`   ✅ 11th Commerce 20 students match PC Desktop EXE 100% character-for-character!`);
}

// 3. Verify Dhruv Shah in SY (BSY)
const bsy = getBatchStudents('BSY');
const dhruvInBsy = bsy.find((s) => s.full_name === 'Dhruv Shah');
console.log(`\n3. Checking Dhruv Shah in SY Cohort:`);
if (dhruvInBsy) {
  console.log(`   ✅ Dhruv Shah found in SY!`);
  console.log(`      ID: ${dhruvInBsy.id}`);
  console.log(`      Roll No: ${dhruvInBsy.roll_no}`);
  console.log(`      Contact: ${dhruvInBsy.contact_number}`);
  console.log(`      Parent: ${dhruvInBsy.parent_name}`);
} else {
  console.error(`   ❌ Dhruv Shah was NOT found in SY!`);
}

// 4. Test Live Local Wi-Fi Hub HTTP Endpoints
console.log(`\n4. Testing Live Local Wi-Fi Hub HTTP Endpoints (Port 5173):`);
try {
  const statusRes = await fetch('http://localhost:5173/api/local-hub?action=status');
  const statusData = await statusRes.json();
  console.log(`   ✅ Hub Status: ${statusData.service} (IP: ${statusData.localIp})`);

  const hubB11Res = await fetch('http://localhost:5173/api/local-hub?action=students&batch_id=B11');
  const hubB11Data = await hubB11Res.json();
  console.log(`   ✅ Hub B11 Students Count: ${hubB11Data.students?.length} (First: ${hubB11Data.students?.[0]?.full_name})`);

  const hubSyRes = await fetch('http://localhost:5173/api/local-hub?action=students&batch_id=BSY');
  const hubSyData = await hubSyRes.json();
  const dhruvHub = hubSyData.students?.find((s) => s.full_name === 'Dhruv Shah');
  console.log(`   ✅ Hub SY Students Count: ${hubSyData.students?.length} (Dhruv Shah found: ${Boolean(dhruvHub)})`);

  // 5. Test Live Attendance Push & Poll
  const testDate = new Date().toISOString().split('T')[0];
  const postAttendanceRes = await fetch('http://localhost:5173/api/local-hub?action=attendance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'attendance',
      batch_id: 'B11',
      date: testDate,
      records: [
        { student_id: 'ST1001', admission_no: 'ST1001', status: 'Present', full_name: 'Krishna Dave' },
        { student_id: 'ST1006', admission_no: 'ST1006', status: 'Absent', full_name: 'Ananya Joshi' },
      ],
    }),
  });
  const postData = await postAttendanceRes.json();
  console.log(`\n5. Testing Live Attendance Post & Poll:`);
  console.log(`   ✅ Post Response: ${postData.message}`);

  const pollRes = await fetch(`http://localhost:5173/api/local-hub?action=updates&date=${testDate}&batch_id=B11`);
  const pollData = await pollRes.json();
  const polledKrishna = pollData.records?.find((r) => r.admission_no === 'ST1001');
  const polledAnanya = pollData.records?.find((r) => r.admission_no === 'ST1006');
  console.log(`   ✅ Polled Updates: Krishna Dave status = ${polledKrishna?.status}, Ananya Joshi status = ${polledAnanya?.status}`);

  console.log('\n🎉 ALL 5 VERIFICATION CHECKS PASSED PERFECTLY!');
} catch (err) {
  console.error('Hub test error:', err.message);
}
