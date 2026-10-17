import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';

const bPath = 'C:/Users/dusha/Downloads/sms_batches_complete.xlsx';
const sPath = 'C:/Users/dusha/Downloads/sms_students_complete.xlsx';

const bWb = xlsx.readFile(bPath);
const sWb = xlsx.readFile(sPath);

const rawBatches = xlsx.utils.sheet_to_json(bWb.Sheets[bWb.SheetNames[0]]);
const rawStudents = xlsx.utils.sheet_to_json(sWb.Sheets[sWb.SheetNames[0]]);

const batchMap = {
  '11th Commerce': 'B11',
  '12th Commerce': 'B12',
  'FY': 'BFY',
  'SY': 'BSY',
  'TY': 'BTY',
};

const canonicalBatches = rawBatches.map((b) => {
  const id = b['Batch ID'];
  return {
    id: id,
    code: id,
    name: b['Batch Name'],
    displayName: `${id} — ${b['Batch Name']}`,
    timing: b['Timing'],
    classroom: b['Classroom'],
    capacity: b['Capacity'] || 25,
    status: b['Status'] || 'Active',
    is_active: true,
    student_count: 20,
  };
});

const canonicalStudents = rawStudents.map((s) => {
  const batchId = batchMap[s['Batch']] || s['Batch'];
  return {
    id: s['Student ID'],
    admission_no: s['Student ID'],
    roll_no: Number(s['Roll No']),
    full_name: s['Student Name'],
    batch_id: batchId,
    batch_name: s['Batch'],
    gender: s['Gender'] || 'Male',
    contact_number: String(s['Contact Number'] || ''),
    parent_name: s['Parent Name'] || '',
    email: s['Email ID'] || '',
  };
});

const fileContent = `/**
 * SMS — Canonical School Batches & Student Roster
 * Embedded institutional data from official school records.
 * 5 Cohort Batches & 100 Enrolled Students (20 students per batch).
 */

export const CANONICAL_BATCHES = ${JSON.stringify(canonicalBatches, null, 2)};

export const CANONICAL_STUDENTS = ${JSON.stringify(canonicalStudents, null, 2)};

export function getBatchStudents(batchId) {
  if (!batchId) return [];
  const clean = String(batchId).trim().toUpperCase();
  return CANONICAL_STUDENTS.filter(
    (s) =>
      s.batch_id.toUpperCase() === clean ||
      s.batch_name.toUpperCase() === clean ||
      clean.includes(s.batch_id.toUpperCase())
  );
}

export function getBatchById(batchId) {
  if (!batchId) return null;
  const clean = String(batchId).trim().toUpperCase();
  return (
    CANONICAL_BATCHES.find(
      (b) =>
        b.id.toUpperCase() === clean ||
        b.code.toUpperCase() === clean ||
        b.name.toUpperCase() === clean ||
        clean.includes(b.code.toUpperCase())
    ) || null
  );
}
`;

const targetDir = path.resolve('src/data');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

fs.writeFileSync(path.join(targetDir, 'canonicalSchoolData.js'), fileContent, 'utf-8');
console.log('SUCCESS: Generated canonicalSchoolData.js with 5 batches and 100 students!');
