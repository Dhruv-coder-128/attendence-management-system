import { CANONICAL_STUDENTS, CANONICAL_BATCHES } from '../src/data/canonicalSchoolData.js';
import fs from 'fs';

console.log('======================================================');
console.log('AUTHORITATIVE ROSTER & BATCH INTEGRITY VERIFICATION');
console.log('======================================================');

// 1. Total students check
if (CANONICAL_STUDENTS.length !== 101) {
  console.error(`FAIL: Expected 101 students, found ${CANONICAL_STUDENTS.length}`);
  process.exit(1);
}
console.log(`✓ PASS: Total Students count is exactly ${CANONICAL_STUDENTS.length}`);

// 2. Batch check
if (CANONICAL_BATCHES.length !== 6) {
  console.error(`FAIL: Expected 6 batches, found ${CANONICAL_BATCHES.length}`);
  process.exit(1);
}
console.log(`✓ PASS: Total Batches count is ${CANONICAL_BATCHES.length}`);

const batchMap = {
  B11: { name: '11th Commerce', expectedCount: 20 },
  B12: { name: '12th Commerce', expectedCount: 20 },
  BFY: { name: 'FY', expectedCount: 20 },
  BSY: { name: 'SY', expectedCount: 20 },
  BTY: { name: 'TY', expectedCount: 20 },
  'B11-B': { name: '11th Commerce - Division B', expectedCount: 1 },
};

for (const [batchId, { name: batchName, expectedCount }] of Object.entries(batchMap)) {
  const students = CANONICAL_STUDENTS.filter((s) => s.batch_id === batchId);
  if (students.length !== expectedCount) {
    console.error(`FAIL: Batch ${batchId} (${batchName}) has ${students.length} students, expected ${expectedCount}.`);
    process.exit(1);
  }
  const rolls = students.map((s) => s.roll_no);
  const expectedRolls = Array.from({ length: expectedCount }, (_, i) => i + 1);
  const matches = rolls.every((r, idx) => r === expectedRolls[idx]);
  if (!matches) {
    console.error(`FAIL: Batch ${batchId} roll numbers do not match 1..${expectedCount}:`, rolls);
    process.exit(1);
  }
  console.log(`✓ PASS: Batch [${batchId}] "${batchName}": ${expectedCount} student(s), Roll numbers strictly 1 to ${expectedCount}`);
}

// 3. Verify specific samples from user's provided Excel
const sample1 = CANONICAL_STUDENTS.find((s) => s.id === 'ST1001');
if (!sample1 || sample1.roll_no !== 1 || sample1.full_name !== 'Krishna D. Dave' || sample1.batch_id !== 'B11') {
  console.error('FAIL: Sample ST1001 did not match authoritative data', sample1);
  process.exit(1);
}
console.log('✓ PASS: ST1001: Krishna D. Dave, Roll 1, 11th Commerce');

const sample2 = CANONICAL_STUDENTS.find((s) => s.id === 'ST1021');
if (!sample2 || sample2.roll_no !== 1 || sample2.full_name !== 'Reyansh Thakkar' || sample2.batch_id !== 'B12') {
  console.error('FAIL: Sample ST1021 did not match authoritative data', sample2);
  process.exit(1);
}
console.log('✓ PASS: ST1021: Reyansh Thakkar, Roll 1, 12th Commerce');

const sample3 = CANONICAL_STUDENTS.find((s) => s.id === 'ST1061');
if (!sample3 || sample3.roll_no !== 1 || sample3.full_name !== 'Saanvi Vora' || sample3.batch_id !== 'BSY') {
  console.error('FAIL: Sample ST1061 did not match authoritative data', sample3);
  process.exit(1);
}
console.log('✓ PASS: ST1061: Saanvi Vora, Roll 1, SY (Fixed former 4,9,14,19 bug!)');

const sample4 = CANONICAL_STUDENTS.find((s) => s.id === 'ST1100');
if (!sample4 || sample4.roll_no !== 20 || sample4.full_name !== 'Adhira Patel' || sample4.batch_id !== 'BTY') {
  console.error('FAIL: Sample ST1100 did not match authoritative data', sample4);
  process.exit(1);
}
console.log('✓ PASS: ST1100: Adhira Patel, Roll 20, TY');

const sample5 = CANONICAL_STUDENTS.find((s) => s.id === 'ST1019-DHRUV');
if (!sample5 || sample5.roll_no !== 1 || sample5.full_name !== 'Dhruv Shah' || sample5.batch_id !== 'B11-B') {
  console.error('FAIL: Sample ST1019-DHRUV did not match authoritative data', sample5);
  process.exit(1);
}
console.log('✓ PASS: ST1019-DHRUV: Dhruv Shah, Roll 1, 11th Commerce - Division B');

// 4. Verify school_database.json matches
const dbRaw = JSON.parse(fs.readFileSync('./src/data/school_database.json', 'utf8'));
if (!dbRaw.students || dbRaw.students.length !== 101) {
  console.error(`FAIL: school_database.json students count = ${dbRaw.students?.length}`);
  process.exit(1);
}
console.log(`✓ PASS: school_database.json contains all ${dbRaw.students.length} students synchronized.`);

console.log('======================================================');
console.log('ALL ROSTER & BATCH INTEGRITY CHECKS PASSED (100% CLEAN)');
console.log('======================================================');
