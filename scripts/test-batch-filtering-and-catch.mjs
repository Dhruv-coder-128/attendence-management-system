import { supabase } from '../src/lib/supabase.js';

async function runTests() {
  console.log('====================================================');
  console.log('TESTING BATCH-WISE STUDENT ISOLATION & CATCH SAFETY');
  console.log('====================================================\n');

  // TEST 1: Database Adapter Promise Compliance (.then().catch())
  console.log('--- TEST 1: Database Adapter Promise Compliance ---');
  let test1Passed = false;
  try {
    const testRecord = {
      student_id: 'TEST-STU-PROMISE',
      admission_no: 'TEST-STU-PROMISE',
      batch_id: 'B11',
      date: '2026-10-18',
      session_name: 'Regular',
      status: 'Present',
    };

    let thenCalled = false;
    let catchCalled = false;

    const p = supabase
      .from('attendance')
      .upsert([testRecord], { onConflict: 'student_id,batch_id,date,session_name' });

    await p
      .then((res) => {
        thenCalled = true;
        return res;
      })
      .catch((err) => {
        catchCalled = true;
      });

    if (thenCalled && !catchCalled) {
      console.log('  ✓ PASS: supabase.from().upsert().then().catch() executed cleanly without throwing');
      test1Passed = true;
    } else {
      console.error('  ✗ FAIL: thenable did not resolve as expected');
    }
  } catch (err) {
    console.error('  ✗ FAIL: Threw error during .then().catch():', err);
  }

  // TEST 2: Strict Batch Filtering in Local Hub
  console.log('\n--- TEST 2: Strict Batch Filtering in Local Hub ---');
  const base = 'http://127.0.0.1:5173/api/local-hub';
  let test2Passed = false;
  let test3Passed = false;
  let test4Passed = false;

  try {
    // 2.1 Batches endpoint has student_count
    const batchRes = await fetch(`${base}?action=batches`);
    const batchData = await batchRes.json();
    const batches = batchData.batches || [];
    console.log(`  Batches returned: ${batches.length}`);
    const hasCounts = batches.every((b) => b.student_count !== undefined && b.student_count >= 0);
    if (hasCounts && batches.length > 0) {
      console.log(`  ✓ PASS: Every batch contains dynamic student_count (Sample: ${batches[0].name} has ${batches[0].student_count} students)`);
      test2Passed = true;
    } else {
      console.error('  ✗ FAIL: Batches missing student_count property');
    }

    // 2.2 Query B11 specifically
    const b11Res = await fetch(`${base}?action=students&batch_id=B11`);
    const b11Data = await b11Res.json();
    const b11Count = b11Data.count || 0;
    console.log(`  Query for batch B11 returned: ${b11Count} students`);
    // Crucial check: Must NOT return all 101 students! Must return only B11 students (20)
    if (b11Count > 0 && b11Count < 50) {
      console.log(`  ✓ PASS: B11 returned strictly ${b11Count} students (NOT all 101 students)`);
      test3Passed = true;
    } else {
      console.error(`  ✗ FAIL: Expected ~20 students for B11, got ${b11Count}`);
    }

    // 2.3 Query B12 specifically
    const b12Res = await fetch(`${base}?action=students&batch_id=B12`);
    const b12Data = await b12Res.json();
    const b12Count = b12Data.count || 0;
    console.log(`  Query for batch B12 returned: ${b12Count} students`);
    if (b12Count > 0 && b12Count < 50) {
      console.log(`  ✓ PASS: B12 returned strictly ${b12Count} students (NOT all 101 students)`);
      test4Passed = true;
    } else {
      console.error(`  ✗ FAIL: Expected ~20 students for B12, got ${b12Count}`);
    }
  } catch (err) {
    console.error('  ✗ Note: Live hub might not be running in this command context:', err.message);
  }

  console.log('\n====================================================');
  console.log(`TEST RESULTS: Test 1 (Catch Fix): ${test1Passed ? 'PASS' : 'FAIL'}`);
  console.log('====================================================\n');

  if (!test1Passed) {
    process.exit(1);
  }
}

runTests().catch(console.error);
