/**
 * Comprehensive Validation Test Suite for ERP Bulk Import Engine
 * Tests CSV & XLSX parsing, column auto-mapping, schema validation,
 * duplicate detection, empty files, and error exports.
 */

import * as XLSX from 'xlsx';
import { ENTITY_SCHEMAS } from '../src/lib/importer/entitySchemas.js';
import { normalizeHeader, autoMapColumns } from '../src/lib/importer/fileParser.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

console.log('======================================================');
console.log('ERP BULK IMPORT ENGINE — AUTOMATED VALIDATION SUITE');
console.log('======================================================\n');

// TEST 1: Header Normalization
console.log('--- TEST 1: Header Normalization ---');
assert(normalizeHeader('Student Full Name') === 'studentfullname', 'Normalizes spaced titles');
assert(normalizeHeader('admission_no') === 'admissionno', 'Normalizes underscores');
assert(normalizeHeader('COURSE-CODE (ID)') === 'coursecodeid', 'Strips punctuation');
assert(normalizeHeader('') === '', 'Handles empty string gracefully');

// TEST 2: Automated Column Mapping
console.log('\n--- TEST 2: Automated Column Mapping ---');
const studentSchema = ENTITY_SCHEMAS.students;
const sampleFileHeaders = [
  'Student Name',
  'Adm No',
  'Class Roll',
  'Division',
  'Sex',
  'Birth Date',
  'Mobile',
  'Email Address',
];

const mapped = autoMapColumns(studentSchema, sampleFileHeaders);
assert(mapped.full_name === 'Student Name', 'Auto-maps "Student Name" -> full_name');
assert(mapped.admission_no === 'Adm No', 'Auto-maps "Adm No" -> admission_no');
assert(mapped.roll_no === 'Class Roll', 'Auto-maps "Class Roll" -> roll_no');
assert(mapped.batch_code === 'Division', 'Auto-maps "Division" -> batch_code');
assert(mapped.gender === 'Sex', 'Auto-maps "Sex" -> gender');
assert(mapped.dob === 'Birth Date', 'Auto-maps "Birth Date" -> dob');
assert(mapped.phone === 'Mobile', 'Auto-maps "Mobile" -> phone');
assert(mapped.email === 'Email Address', 'Auto-maps "Email Address" -> email');

// TEST 3: XLSX Generation and Parsing
console.log('\n--- TEST 3: Excel (.xlsx) Generation and Parsing ---');
const testStudents = [
  { 'Admission Number': 'ADM-TEST-001', 'Student Full Name': 'Test Student 1', 'Batch Code (Foreign Key)': 'FYBCA-A' },
  { 'Admission Number': 'ADM-TEST-002', 'Student Full Name': 'Test Student 2', 'Batch Code (Foreign Key)': 'FYBCA-A' },
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(testStudents);
XLSX.utils.book_append_sheet(wb, ws, 'Students');
const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

const parsedWb = XLSX.read(xlsxBuffer, { type: 'buffer' });
assert(parsedWb.SheetNames[0] === 'Students', 'Excel workbook reads sheet name correctly');
const parsedRows = XLSX.utils.sheet_to_json(parsedWb.Sheets['Students']);
assert(parsedRows.length === 2, 'Parsed 2 data rows from XLSX buffer');
assert(parsedRows[0]['Admission Number'] === 'ADM-TEST-001', 'Row 1 values intact');

// TEST 4: CSV Generation and Parsing
console.log('\n--- TEST 4: CSV Generation and Parsing ---');
const csvContent = `"Admission Number","Student Full Name","Batch Code (Foreign Key)"\r\n"ADM-CSV-001","CSV Student 1","11SCI-S1"\r\n"ADM-CSV-002","CSV Student 2","11SCI-S1"`;
const parsedCsvWb = XLSX.read(Buffer.from(csvContent), { type: 'buffer' });
const parsedCsvRows = XLSX.utils.sheet_to_json(parsedCsvWb.Sheets['Sheet1']);
assert(parsedCsvRows.length === 2, 'Parsed 2 rows from CSV content');
assert(parsedCsvRows[1]['Student Full Name'] === 'CSV Student 2', 'CSV values extracted accurately');

// TEST 5: Empty File & Empty Sheet Handling
console.log('\n--- TEST 5: Empty File and Empty Sheet Handling ---');
const emptyWb = XLSX.utils.book_new();
const emptyWs = XLSX.utils.aoa_to_sheet([]);
XLSX.utils.book_append_sheet(emptyWb, emptyWs, 'EmptySheet');
const emptyBuffer = XLSX.write(emptyWb, { type: 'buffer', bookType: 'xlsx' });
const parsedEmptyWb = XLSX.read(emptyBuffer, { type: 'buffer' });
const emptyRows = XLSX.utils.sheet_to_json(parsedEmptyWb.Sheets['EmptySheet']);
assert(emptyRows.length === 0, 'Detects 0 rows on empty spreadsheet');

// TEST 6: In-File Duplicate Detection Logic
console.log('\n--- TEST 6: In-File Duplicate Detection Logic ---');
const duplicateRows = [
  { admission_no: 'ADM-001', full_name: 'First User' },
  { admission_no: 'ADM-002', full_name: 'Second User' },
  { admission_no: 'ADM-001', full_name: 'Duplicate User' }, // Duplicate!
];

const seen = new Set();
const detectedDuplicates = [];
duplicateRows.forEach((r, idx) => {
  if (seen.has(r.admission_no)) {
    detectedDuplicates.push({ row: idx + 1, key: r.admission_no });
  } else {
    seen.add(r.admission_no);
  }
});
assert(detectedDuplicates.length === 1, 'Correctly flagged 1 duplicate record');
assert(detectedDuplicates[0].key === 'ADM-001' && detectedDuplicates[0].row === 3, 'Identified exact duplicate key at row 3');

// TEST 7: Invalid Rows (Missing Required Fields, Bad Formats)
console.log('\n--- TEST 7: Field Validation Rules ---');
function validateRow(schema, row) {
  const errors = [];
  schema.fields.forEach((field) => {
    const val = row[field.name];
    if (field.required && (!val || String(val).trim() === '')) {
      errors.push(`Missing required field: ${field.label}`);
    }
    if (val && field.type === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(String(val))) {
        errors.push(`Invalid email format: ${val}`);
      }
    }
    if (val && field.type === 'number') {
      const n = Number(val);
      if (isNaN(n) || (field.name === 'max_capacity' && n <= 0)) {
        errors.push(`Invalid number: ${val}`);
      }
    }
  });
  return errors;
}

const badRow1 = { admission_no: '', full_name: 'No ID Student' };
const errors1 = validateRow(studentSchema, badRow1);
assert(errors1.some((e) => e.includes('Missing required field: Admission Number')), 'Flags missing required admission_no');

const badRow2 = { admission_no: 'ADM-003', full_name: 'Bad Email', email: 'not-an-email' };
const errors2 = validateRow(studentSchema, badRow2);
assert(errors2.some((e) => e.includes('Invalid email format')), 'Flags malformed email address');

const batchSchema = ENTITY_SCHEMAS.batches;
const badBatch = { code: 'B1', name: 'Batch 1', course_code: 'C1', max_capacity: -10 };
const errorsBatch = validateRow(batchSchema, badBatch);
assert(errorsBatch.some((e) => e.includes('Invalid number')), 'Flags negative max_capacity');

// TEST 8: All 4 Entity Schemas Integrity
console.log('\n--- TEST 8: Entity Schemas Definition Integrity ---');
const entities = ['courses', 'batches', 'students', 'parents'];
entities.forEach((ent) => {
  const s = ENTITY_SCHEMAS[ent];
  assert(Boolean(s && s.fields.length >= 4), `Schema "${ent}" has complete field definitions`);
  assert(Boolean(s.table), `Schema "${ent}" defines target table public.${s.table}`);
  assert(s.fields.some((f) => f.required), `Schema "${ent}" declares required constraints`);
});

// TEST 9: Failed Rows CSV Export Formatting
console.log('\n--- TEST 9: Failed Rows CSV Structure ---');
const sampleFailed = [
  {
    rowNumber: 2,
    errors: ['Referenced Course Code "10TH-SCI" does not exist in database'],
    rawData: { 'Batch Code': '10SCI-A', 'Batch Name': 'Grade 10 Science' },
  },
];
const formatted = sampleFailed.map((item) => ({
  'Row Number': item.rowNumber,
  'Error Reason': (item.errors || []).join('; '),
  ...item.rawData,
}));
assert(formatted[0]['Row Number'] === 2, 'Failed export preserves row number');
assert(formatted[0]['Error Reason'].includes('does not exist'), 'Failed export preserves error message');
assert(formatted[0]['Batch Code'] === '10SCI-A', 'Failed export preserves original raw data');

// TEST 10: Intelligent Course Reference Resolver
console.log('\n--- TEST 10: Intelligent Course Reference Resolver ---');
import { resolveCourseReference } from '../src/lib/importer/courseResolver.js';
import { validateImportRows } from '../src/lib/importer/validator.js';

const mockDbCourses = [
  { id: 'c-uuid-11sci', code: '11TH-SCI', name: '11th Standard — Science', level: '11th', description: 'Higher Secondary Science' },
  { id: 'c-uuid-12sci', code: '12TH-SCI', name: '12th Standard — Science', level: '12th', description: 'Higher Secondary Science Board' },
  { id: 'c-uuid-11com', code: '11TH-COM', name: '11th Standard — Commerce', level: '11th', description: 'Higher Secondary Commerce' },
  { id: 'c-uuid-12com', code: '12TH-COM', name: '12th Standard — Commerce', level: '12th', description: 'Higher Secondary Commerce Board' },
  { id: 'c-uuid-fybca', code: 'FY-BCA', name: 'First Year — Bachelor of Computer Applications', level: 'FY', description: 'UG BCA' },
  { id: 'c-uuid-sybca', code: 'SY-BCA', name: 'Second Year — Bachelor of Computer Applications', level: 'SY', description: 'UG BCA' },
  { id: 'c-uuid-tybca', code: 'TY-BCA', name: 'Third Year — Bachelor of Computer Applications', level: 'TY', description: 'UG BCA' },
];

// 10.1: Exact Code
const resExact = resolveCourseReference('11TH-SCI', mockDbCourses);
assert(resExact.success && resExact.course_code === '11TH-SCI' && resExact.matchedBy === 'code', 'Resolves exact course code "11TH-SCI"');

// 10.2: Stable UUID
const resUuid = resolveCourseReference('c-uuid-fybca', mockDbCourses);
assert(resUuid.success && resUuid.course_code === 'FY-BCA' && resUuid.matchedBy === 'id', 'Resolves stable UUID "c-uuid-fybca"');

// 10.3: Common variations (The 5 rows from user issue)
const res11Sci = resolveCourseReference('11TH SCIENCE', mockDbCourses);
assert(res11Sci.success && res11Sci.course_code === '11TH-SCI' && res11Sci.course_id === 'c-uuid-11sci', 'Resolves variation "11TH SCIENCE" -> 11TH-SCI');

const res12Sci = resolveCourseReference('12TH SCIENCE', mockDbCourses);
assert(res12Sci.success && res12Sci.course_code === '12TH-SCI' && res12Sci.course_id === 'c-uuid-12sci', 'Resolves variation "12TH SCIENCE" -> 12TH-SCI');

const resFyBca = resolveCourseReference('FY BCA', mockDbCourses);
assert(resFyBca.success && resFyBca.course_code === 'FY-BCA' && resFyBca.course_id === 'c-uuid-fybca', 'Resolves variation "FY BCA" -> FY-BCA');

const resExactName = resolveCourseReference('11th Standard — Science', mockDbCourses);
assert(resExactName.success && resExactName.course_code === '11TH-SCI', 'Resolves exact course name');

const resCleanCode = resolveCourseReference('FYBCA', mockDbCourses);
assert(resCleanCode.success && resCleanCode.course_code === 'FY-BCA', 'Resolves clean code without hyphens "FYBCA"');

// TEST 11: Ambiguous & Unknown Course Reference Safeguards
console.log('\n--- TEST 11: Ambiguous & Unknown Course Reference Safeguards ---');
const resAmbiguousSci = resolveCourseReference('Science', mockDbCourses);
assert(!resAmbiguousSci.success, 'Rejects ambiguous reference "Science"');
assert(resAmbiguousSci.error.includes('Ambiguous course reference'), 'Provides clear ambiguous error message');
assert(resAmbiguousSci.candidates.length >= 2, 'Identifies multiple candidate courses for ambiguous input');

const resAmbiguousCom = resolveCourseReference('Commerce', mockDbCourses);
assert(!resAmbiguousCom.success, 'Rejects ambiguous reference "Commerce"');
assert(resAmbiguousCom.candidates.some(c => c.code === '11TH-COM') && resAmbiguousCom.candidates.some(c => c.code === '12TH-COM'), 'Flags 11TH-COM and 12TH-COM as ambiguous candidates');

const resUnknown = resolveCourseReference('Robotics Engineering', mockDbCourses);
assert(!resUnknown.success, 'Rejects unknown reference "Robotics Engineering"');
assert(resUnknown.error.includes('Valid course codes:'), 'Provides list of valid course codes in error message');

// TEST 12: End-to-End Batch Import Validation Pipeline with Row Revalidation
console.log('\n--- TEST 12: End-to-End Batch Import Validation Pipeline ---');
const mockBatchContext = {
  existingCourseCodes: new Set(mockDbCourses.map(c => c.code)),
  existingBatchCodes: new Set(['FYBCA-EXISTING']),
  existingStudentAdmissionNos: new Set(),
  coursesList: mockDbCourses,
  coursesMap: new Map(mockDbCourses.map(c => [c.code, c])),
  batchesMap: new Map(),
  studentsMap: new Map(),
};

// 5 rows imitating user spreadsheet containing "11TH SCIENCE", "12TH SCIENCE", "FY BCA"
const batchFileRows = [
  { _rowNum: 1, 'Batch Code': '11SCI-DIVA', 'Batch Name': '11th Science Div A', 'Course Code': '11TH SCIENCE', 'Max Capacity': '60' },
  { _rowNum: 2, 'Batch Code': '11SCI-DIVB', 'Batch Name': '11th Science Div B', 'Course Code': '11TH SCIENCE', 'Max Capacity': '50' },
  { _rowNum: 3, 'Batch Code': '12SCI-DIVA', 'Batch Name': '12th Science Div A', 'Course Code': '12TH SCIENCE', 'Max Capacity': '60' },
  { _rowNum: 4, 'Batch Code': '12SCI-DIVB', 'Batch Name': '12th Science Div B', 'Course Code': '12TH SCIENCE', 'Max Capacity': '60' },
  { _rowNum: 5, 'Batch Code': 'FYBCA-SEC1', 'Batch Name': 'FY BCA Section 1', 'Course Code': 'FY BCA', 'Max Capacity': '45' },
];

const batchColMapping = {
  code: 'Batch Code',
  name: 'Batch Name',
  course_code: 'Course Code',
  max_capacity: 'Max Capacity',
};

const validationRun = await validateImportRows('batches', batchFileRows, batchColMapping, mockBatchContext);

assert(validationRun.summary.total === 5, 'Processes all 5 rows in file');
assert(validationRun.summary.valid === 5, 'Revalidates all 5 rows as VALID (0 invalid rows)');
assert(validationRun.summary.errors === 0, 'Zero errors reported for user variations');
assert(validationRun.summary.duplicates === 0, 'Zero false duplicates flagged');

assert(validationRun.validatedRows[0].status === 'valid', 'Row 1 is marked valid');
assert(validationRun.validatedRows[0].resolvedData.course_id === 'c-uuid-11sci', 'Row 1 resolves correct course_id foreign key');
assert(validationRun.validatedRows[0].resolvedData.course_code === '11TH-SCI', 'Row 1 normalizes course_code to canonical "11TH-SCI"');
assert(validationRun.validatedRows[0].info.length > 0, 'Row 1 includes resolution note');

assert(validationRun.validatedRows[4].status === 'valid', 'Row 5 (FY BCA) is marked valid');
assert(validationRun.validatedRows[4].resolvedData.course_id === 'c-uuid-fybca', 'Row 5 resolves correct course_id for FY-BCA');

// Revalidation with an invalid and duplicate row
const mixedFileRows = [
  { _rowNum: 1, 'Batch Code': 'NEW-BATCH', 'Batch Name': 'New Batch', 'Course Code': '11TH-SCI' },
  { _rowNum: 2, 'Batch Code': 'FYBCA-EXISTING', 'Batch Name': 'Existing Batch', 'Course Code': 'FY-BCA' }, // Duplicate
  { _rowNum: 3, 'Batch Code': 'BAD-COURSE', 'Batch Name': 'Bad Course', 'Course Code': 'Science' }, // Ambiguous
  { _rowNum: 4, 'Batch Code': 'UNKNOWN-C', 'Batch Name': 'Unknown', 'Course Code': 'CIVIL-ENG' }, // Unknown
];

const mixedValidation = await validateImportRows('batches', mixedFileRows, batchColMapping, mockBatchContext);
assert(mixedValidation.summary.valid === 1, 'Correctly flags exactly 1 valid row');
assert(mixedValidation.summary.duplicates === 1, 'Correctly flags 1 duplicate row (FYBCA-EXISTING)');
assert(mixedValidation.summary.errors === 2, 'Correctly flags 2 error rows (Ambiguous + Unknown)');
assert(mixedValidation.validatedRows[2].errors[0].includes('Ambiguous course reference'), 'Row 3 error explains ambiguity');
assert(mixedValidation.validatedRows[3].errors[0].includes('does not match any course'), 'Row 4 error explains unknown course code');

// SUMMARY
console.log('\n======================================================');
console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
console.log('======================================================');

if (failed > 0) {
  process.exit(1);
}

