import assert from 'node:assert';

console.log('======================================================');
console.log('END-TO-END SCHOOL IMPORT & ATTENDANCE FLOW TEST SUITE');
console.log('======================================================\n');

let passed = 0;
let failed = 0;

function testAssert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

// 1. TEST BATCH RESOLVER
console.log('--- TEST 1: Smart Batch Resolution (Name, Code & Fuzzy) ---');
const { resolveBatchReference } = await import('../src/lib/importer/batchResolver.js');

const mockDatabaseBatches = [
  { id: 'batch-bfy-id', code: 'BFY', name: 'FY', course_id: 'course-sci-id' },
  { id: 'batch-bsy-id', code: 'BSY', name: 'SY', course_id: 'course-sci-id' },
  { id: 'batch-b12-id', code: 'B12', name: '12th Commerce', course_id: 'course-com-id' },
  { id: 'batch-bty-id', code: 'BTY', name: 'TY', course_id: 'course-sci-id' },
  { id: 'batch-b11-id', code: 'B11', name: '11th Commerce', course_id: 'course-com-id' },
];

// Test: Match by Name "11th Commerce" must resolve to B11, NOT BFY!
const res11Com = resolveBatchReference('11th Commerce', mockDatabaseBatches);
testAssert(res11Com.success, 'Resolved "11th Commerce" successfully');
testAssert(res11Com.batch_code === 'B11', `Matched batch code B11 (got ${res11Com.batch_code})`);
testAssert(res11Com.batch_id === 'batch-b11-id', `Matched batch ID B11 (got ${res11Com.batch_id})`);

// Test: Match by Name "12th Commerce" must resolve to B12
const res12Com = resolveBatchReference('12th Commerce', mockDatabaseBatches);
testAssert(res12Com.batch_code === 'B12', `Matched batch code B12 (got ${res12Com.batch_code})`);

// Test: Match by Name "FY" must resolve to BFY
const resFY = resolveBatchReference('FY', mockDatabaseBatches);
testAssert(resFY.batch_code === 'BFY', `Matched batch code BFY for "FY" (got ${resFY.batch_code})`);

// Test: Match by Name "SY" must resolve to BSY
const resSY = resolveBatchReference('SY', mockDatabaseBatches);
testAssert(resSY.batch_code === 'BSY', `Matched batch code BSY for "SY" (got ${resSY.batch_code})`);

// Test: Match by Name "TY" must resolve to BTY
const resTY = resolveBatchReference('TY', mockDatabaseBatches);
testAssert(resTY.batch_code === 'BTY', `Matched batch code BTY for "TY" (got ${resTY.batch_code})`);

// Test: Clean alphanumeric & token matching e.g. "11 Commerce"
const resFuzzy = resolveBatchReference('11 Commerce', mockDatabaseBatches);
testAssert(resFuzzy.batch_code === 'B11', `Matched fuzzy "11 Commerce" to B11 (got ${resFuzzy.batch_code})`);

// 2. TEST STUDENTS VALIDATOR WITH MULTI-BATCH DISTRIBUTION
console.log('\n--- TEST 2: Student Import Batch Distribution ---');
const { validateImportRows } = await import('../src/lib/importer/validator.js');

const mockStudentRows = [
  { _rowNum: 2, 'Student Name': 'Rohan Mehta', 'Batch': '11th Commerce', 'Roll No': '1' },
  { _rowNum: 3, 'Student Name': 'Priya Shah', 'Batch': '12th Commerce', 'Roll No': '2' },
  { _rowNum: 4, 'Student Name': 'Aarav Patel', 'Batch': 'FY', 'Roll No': '3' },
  { _rowNum: 5, 'Student Name': 'Diya Desai', 'Batch': 'SY', 'Roll No': '4' },
  { _rowNum: 6, 'Student Name': 'Kavya Joshi', 'Batch': 'TY', 'Roll No': '5' },
];

const mockStudentMapping = {
  full_name: 'Student Name',
  batch_code: 'Batch',
  roll_no: 'Roll No',
};

const mockInjectedContext = {
  existingCourseCodes: new Set(),
  existingBatchCodes: new Set(['BFY', 'BSY', 'B12', 'BTY', 'B11']),
  existingStudentAdmissionNos: new Set(),
  coursesList: [],
  batchesList: mockDatabaseBatches,
  batchesMap: new Map(mockDatabaseBatches.flatMap((b) => [[b.code, b], [b.name.toUpperCase(), b]])),
  studentsList: [],
  studentsMap: new Map(),
  studentsByNameMap: new Map(),
  studentsByRollMap: new Map(),
};

const studentValResult = await validateImportRows(
  'students',
  mockStudentRows,
  mockStudentMapping,
  mockInjectedContext
);

testAssert(studentValResult.summary.total === 5, 'Validated 5 student rows');
testAssert(studentValResult.summary.errors === 0, '0 student validation errors');
testAssert(studentValResult.validatedRows[0].resolvedData.batch_id === 'batch-b11-id', 'Student 1 mapped to B11 (11th Commerce)');
testAssert(studentValResult.validatedRows[1].resolvedData.batch_id === 'batch-b12-id', 'Student 2 mapped to B12 (12th Commerce)');
testAssert(studentValResult.validatedRows[2].resolvedData.batch_id === 'batch-bfy-id', 'Student 3 mapped to BFY (FY)');
testAssert(studentValResult.validatedRows[3].resolvedData.batch_id === 'batch-bsy-id', 'Student 4 mapped to BSY (SY)');
testAssert(studentValResult.validatedRows[4].resolvedData.batch_id === 'batch-bty-id', 'Student 5 mapped to BTY (TY)');

// 3. TEST PARENT IMPORT WITH ZERO FAILURES
console.log('\n--- TEST 3: Parent Import Resilience (Zero Required Blocker) ---');

// Mock existing students in context
const existingStudents = [
  { id: 'stud-1-id', admission_no: 'ADM-2026-0001', full_name: 'Rohan Mehta', roll_no: '1' },
  { id: 'stud-2-id', admission_no: 'ADM-2026-0002', full_name: 'Priya Shah', roll_no: '2' },
  { id: 'stud-3-id', admission_no: 'ADM-2026-0003', full_name: 'Aarav Patel', roll_no: '3' },
];

const mockParentContext = {
  ...mockInjectedContext,
  studentsList: existingStudents,
  studentsMap: new Map(existingStudents.map((s) => [s.admission_no, s])),
  studentsByNameMap: new Map(existingStudents.map((s) => [s.full_name.toLowerCase(), s])),
  studentsByRollMap: new Map(existingStudents.map((s) => [s.roll_no, s])),
};

// Row 1 links by Student Name (not admission no!)
// Row 2 links by Roll Number
// Row 3 has no student link specified
const mockParentRows = [
  { _rowNum: 2, 'Guardian Name': 'Kishore Mehta', 'Mobile': '9822011111', 'Child Name': 'Rohan Mehta' },
  { _rowNum: 3, 'Guardian Name': 'Bhavin Shah', 'Mobile': '9822022222', 'Roll': '2' },
  { _rowNum: 4, 'Guardian Name': 'Nilesh Patel', 'Mobile': '9822033333' },
];

const mockParentMapping = {
  full_name: 'Guardian Name',
  phone: 'Mobile',
  student_admission_no: 'Child Name',
};

const parentValResult = await validateImportRows(
  'parents',
  mockParentRows,
  mockParentMapping,
  mockParentContext
);

testAssert(parentValResult.summary.total === 3, 'Processed 3 parent rows');
testAssert(parentValResult.summary.errors === 0, `0 errors on parent import (got ${parentValResult.summary.errors})`);
testAssert(parentValResult.summary.valid === 3, `All 3 rows marked valid (got ${parentValResult.summary.valid})`);
testAssert(parentValResult.validatedRows[0].resolvedData.student_id === 'stud-1-id', 'Parent 1 linked to student by Name');
testAssert(Boolean(parentValResult.validatedRows[1].resolvedData.student_id), 'Parent 2 auto-linked to student');
testAssert(Boolean(parentValResult.validatedRows[2].resolvedData.student_id), 'Parent 3 auto-linked sequentially');

console.log('\n======================================================');
console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
