/**
 * Automated Test Suite for Universal Master Data Importer
 * Tests:
 * 1. Single Flat Master Sheet parsing (single sheet with Course, Batch, Student, Parent, Fee)
 * 2. JSON format parsing (flat array and full DB backup restore)
 * 3. CSV parsing with fuzzy header mapping
 * 4. Template generator exports for xlsx, csv, and json
 */

import * as XLSX from 'xlsx';
import { parseMasterSpreadsheet, commitMasterSpreadsheetData } from '../src/lib/importer/masterExcelImporter.js';
import { ALL_IN_ONE_SAMPLE_RECORDS } from '../src/lib/importer/templateGenerator.js';

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
console.log('UNIVERSAL MASTER IMPORTER — AUTOMATED TEST SUITE');
console.log('======================================================\n');

// Mock File helper
function createMockFile(name, content, type = 'application/octet-stream') {
  return {
    name,
    type,
    size: content.byteLength || content.length,
    arrayBuffer: async () => {
      if (Buffer.isBuffer(content)) {
        return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength);
      }
      return Buffer.from(content).buffer;
    },
    text: async () => {
      if (typeof content === 'string') return content;
      return Buffer.from(content).toString('utf-8');
    },
  };
}

// TEST 1: Template Data Records (XLSX, CSV, JSON)
console.log('--- TEST 1: Template Data Records ---');
assert(Array.isArray(ALL_IN_ONE_SAMPLE_RECORDS), 'Template sample records is an array');
assert(ALL_IN_ONE_SAMPLE_RECORDS.length > 0, `Template has sample records (${ALL_IN_ONE_SAMPLE_RECORDS.length})`);
assert(ALL_IN_ONE_SAMPLE_RECORDS[0]['Student Full Name'] && ALL_IN_ONE_SAMPLE_RECORDS[0]['Course Name'] && ALL_IN_ONE_SAMPLE_RECORDS[0]['Batch Name'], 'Sample record has student, course, and batch fields');

// TEST 2: Parse JSON Master File (Flat Records)
console.log('\n--- TEST 2: JSON Master File (Flat Records) ---');
const sampleJsonFlat = JSON.stringify([
  {
    full_name: 'Aarav Patel',
    admission_no: 'ADM-JSON-001',
    roll_no: '101',
    course_name: 'Standard 10 - GSEB',
    batch_name: 'Std 10 Alpha',
    parent_name: 'Rajesh Patel',
    parent_phone: '9876543210',
    tuition_fee: 45000,
    fee_paid: 20000,
  },
  {
    full_name: 'Diya Shah',
    admission_no: 'ADM-JSON-002',
    roll_no: '102',
    course_name: 'Standard 12 - Science',
    batch_name: 'Std 12 PCB',
    parent_name: 'Mukesh Shah',
    parent_phone: '9876543211',
    tuition_fee: 65000,
    fee_paid: 65000,
  },
]);

const jsonFile = createMockFile('students_master.json', sampleJsonFlat, 'application/json');
const parsedJson = await parseMasterSpreadsheet(jsonFile);
assert(parsedJson.parsedRows.length === 2, `Parsed 2 records from JSON (got ${parsedJson.parsedRows.length})`);
assert(parsedJson.parsedRows[0].studentName === 'Aarav Patel', 'Record 1 student name matches');
assert(parsedJson.parsedRows[0].courseName === 'Standard 10 - GSEB', 'Record 1 course name matches');
assert(parsedJson.parsedRows[0].batchName === 'Std 10 Alpha', 'Record 1 batch name matches');
assert(parsedJson.summary.distinctCourses.length === 2, 'Identified 2 distinct courses');
assert(parsedJson.summary.distinctBatches.length === 2, 'Identified 2 distinct batches');

// TEST 3: Parse JSON Full Database Backup
console.log('\n--- TEST 3: JSON Database Backup File ---');
const backupJson = JSON.stringify({
  version: '2.0.0',
  export_date: new Date().toISOString(),
  tables: {
    courses: [{ id: 'c1', name: 'Science 11', course_code: 'SCI11' }],
    batches: [{ id: 'b1', name: 'Batch A', batch_code: 'B-A', course_id: 'c1' }],
    students: [{ id: 's1', full_name: 'Kavya Joshi', admission_no: 'ADM-BAK-001' }],
  },
});
const backupFile = createMockFile('sms_backup_2026.json', backupJson, 'application/json');
const parsedBackup = await parseMasterSpreadsheet(backupFile);
assert(parsedBackup.isDatabaseBackup === true, 'Recognized as full database backup mode');
assert(parsedBackup.backupData.tables.courses.length === 1, 'Backup contains 1 course');
assert(parsedBackup.backupData.tables.batches.length === 1, 'Backup contains 1 batch');
assert(parsedBackup.backupData.tables.students.length === 1, 'Backup contains 1 student');

// TEST 4: Parse Single Flat Master Excel Sheet
console.log('\n--- TEST 4: Single Flat Master Excel Sheet ---');
const flatWb = XLSX.utils.book_new();
const flatRows = [
  {
    'Full Name': 'Rohan Mehta',
    'Admission ID': 'ADM-XLS-001',
    'Roll': '1',
    'Class / Course': 'Standard 9',
    'Batch / Section': 'Section A',
    'Father Name': 'Kishore Mehta',
    'Parent Mobile': '9123456780',
    'Gender': 'Male',
    'Fee Total': '35000',
    'Fee Paid': '15000',
  },
  {
    'Full Name': 'Pooja Dave',
    'Admission ID': 'ADM-XLS-002',
    'Roll': '2',
    'Class / Course': 'Standard 9',
    'Batch / Section': 'Section B',
    'Father Name': 'Dharmesh Dave',
    'Parent Mobile': '9123456781',
    'Gender': 'Female',
    'Fee Total': '35000',
    'Fee Paid': '35000',
  },
];
const flatWs = XLSX.utils.json_to_sheet(flatRows);
XLSX.utils.book_append_sheet(flatWb, flatWs, 'Master Sheet');
const flatBuffer = XLSX.write(flatWb, { type: 'buffer', bookType: 'xlsx' });
const flatExcelFile = createMockFile('master_students.xlsx', flatBuffer);

const parsedFlatExcel = await parseMasterSpreadsheet(flatExcelFile);
assert(parsedFlatExcel.parsedRows.length === 2, `Parsed 2 flat records (got ${parsedFlatExcel.parsedRows.length})`);
assert(parsedFlatExcel.parsedRows[0].studentName === 'Rohan Mehta', 'Auto-mapped "Full Name" -> studentName');
assert(parsedFlatExcel.parsedRows[0].courseName === 'Standard 9', 'Auto-mapped "Class / Course" -> courseName');
assert(parsedFlatExcel.parsedRows[0].batchName === 'Section A', 'Auto-mapped "Batch / Section" -> batchName');
assert(parsedFlatExcel.parsedRows[0].guardianName === 'Kishore Mehta', 'Auto-mapped "Father Name" -> guardianName');
assert(parsedFlatExcel.parsedRows[0].annualFee === 35000, 'Parsed numeric tuition fee');
assert(parsedFlatExcel.parsedRows[0].paidFee === 15000, 'Parsed numeric fee paid');

// TEST 5: Parse CSV File with comma-separated values
console.log('\n--- TEST 5: CSV File Parsing ---');
const csvString = `Full Name,Admission No,Roll No,Course Name,Batch Name,Parent Name,Parent Phone,Total Fee\n"Manav Trivedi","ADM-CSV-99","50","Physics XI","Batch P1","Sanjay Trivedi","9824098240",30000`;
const csvFile = createMockFile('students.csv', csvString, 'text/csv');
const parsedCsv = await parseMasterSpreadsheet(csvFile);
assert(parsedCsv.parsedRows.length === 1, 'Parsed 1 record from CSV');
assert(parsedCsv.parsedRows[0].studentName === 'Manav Trivedi', 'Parsed CSV student name');
assert(parsedCsv.parsedRows[0].courseName === 'Physics XI', 'Parsed CSV course name');
assert(parsedCsv.parsedRows[0].batchName === 'Batch P1', 'Parsed CSV batch name');

// TEST 6: Validator with relaxed schema, auto-generated codes, and custom enum values
console.log('\n--- TEST 6: Schema Validation & Flexible Enum Acceptance ---');
const { validateImportRows } = await import('../src/lib/importer/validator.js');

const mockCoursesRows = [
  { _rowNum: 2, 'Course Name': '10th Standard State Board' }, // No code, no level!
  { _rowNum: 3, 'Course Name': 'Diploma in Mechanical Engineering', 'Academic Level': 'Diploma' }, // Custom level!
  { _rowNum: 4, 'Course Name': 'Grade 9 CBSE Foundation', 'Academic Level': 'Grade 9' }, // Custom level!
];

const mockMapping = {
  name: 'Course Name',
  level: 'Academic Level',
};

const mockInjectedContext = {
  existingCourseCodes: new Set(),
  coursesList: [],
};

const validationResult = await validateImportRows('courses', mockCoursesRows, mockMapping, mockInjectedContext);
assert(validationResult.summary.total === 3, 'Processed 3 course rows');
assert(validationResult.summary.errors === 0, `0 validation errors (got ${validationResult.summary.errors})`);
assert(validationResult.summary.valid === 3, `All 3 rows marked valid (got ${validationResult.summary.valid})`);
assert(Boolean(validationResult.validatedRows[0].resolvedData.code), 'Row 1 course code was auto-generated');
assert(validationResult.validatedRows[0].resolvedData.level === '10th', `Row 1 level auto-inferred as 10th (got ${validationResult.validatedRows[0].resolvedData.level})`);
assert(validationResult.validatedRows[1].resolvedData.level === 'Diploma', `Row 2 custom level "Diploma" preserved without error (got ${validationResult.validatedRows[1].resolvedData.level})`);
assert(validationResult.validatedRows[2].resolvedData.level === 'Grade 9', `Row 3 custom level "Grade 9" preserved without error (got ${validationResult.validatedRows[2].resolvedData.level})`);

// Summary
console.log('\n======================================================');
console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log('======================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
